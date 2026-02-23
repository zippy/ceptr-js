/**
 * Backtracking tree matcher — matches a semantic tree against a semtrex FSA.
 *
 * Ported from ceptr/src/semtrex.c __t_match.
 *
 * The algorithm:
 * 1. Build FSA from semtrex via makeFA
 * 2. Walk the FSA states against a cursor position in the target tree
 * 3. Use an explicit stack for backtracking on Split/Walk states
 * 4. Capture groups record match boundaries
 */

import { type SemanticID, semeq, NULL_SYMBOL } from './semantic-id.js';
import {
  type SemNode, childAt, childCount, getPath, getByPath,
  nextSibling, getParent, nextInWalk, newEmpty, newNode, newInt, newSym,
} from './tree.js';
import { SYMBOLS } from './base-defs.js';
import {
  type SState, StateType, TransitionDown, TransitionNone,
  isTransitionPop, isTransitionNext,
  LITERAL_NOT, LITERAL_SET,
  matchState,
} from './semtrex-types.js';
import { makeFA } from './semtrex-fsa.js';

// ---- Match result types ----

export interface MatchResult {
  symbol: SemanticID;
  path: number[];
  siblingsCount: number;
  children: MatchResult[];
}

// ---- Internal types ----

interface GroupCapture {
  uid: number;
  symbol: SemanticID;
  startPath: number[];
  startNode: SemNode | null;
  endNode: SemNode | null;
  children: GroupCapture[];
}

interface BranchPoint {
  state: SState;
  cursor: SemNode | null;
  path: number[];
  groups: GroupCapture[];
  // For Walk states:
  walkNode: SemNode | null;
  walkRoot: SemNode | null;
}

// ---- Symbol matching helpers ----

function symbolMatches(state: SState, node: SemNode): boolean {
  if (state.data.kind !== 'symbol') return false;
  const { flags, symbols: symTree } = state.data.symbol;
  const isSet = (flags & LITERAL_SET) !== 0;
  const isNot = (flags & LITERAL_NOT) !== 0;

  let found = false;
  if (isSet) {
    // SEMTREX_SYMBOL_SET: check each child
    for (const child of symTree.children) {
      if (semeq(child.symbol, SYMBOLS.SEMTREX_SYMBOL) && semeq(child.surface as SemanticID, node.symbol)) {
        found = true;
        break;
      }
    }
  } else {
    // Single SEMTREX_SYMBOL child
    const symChild = symTree;
    if (semeq(symChild.symbol, SYMBOLS.SEMTREX_SYMBOL)) {
      found = semeq(symChild.surface as SemanticID, node.symbol);
    }
  }

  return isNot ? !found : found;
}

function valueMatches(state: SState, node: SemNode): boolean {
  if (state.data.kind !== 'value') return false;
  const { flags, values: valTree } = state.data.value;
  const isSet = (flags & LITERAL_SET) !== 0;
  const isNot = (flags & LITERAL_NOT) !== 0;

  let found = false;
  if (isSet) {
    // SEMTREX_VALUE_SET: check each child
    for (const child of valTree.children) {
      if (surfaceEquals(child.surface, node.surface) && semeq(child.symbol, node.symbol)) {
        found = true;
        break;
      }
    }
  } else {
    // Single value child
    const valChild = valTree;
    found = surfaceEquals(valChild.surface, node.surface) && semeq(valChild.symbol, node.symbol);
  }

  return isNot ? !found : found;
}

function surfaceEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  // SemanticID comparison
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const sa = a as SemanticID;
    const sb = b as SemanticID;
    if ('context' in sa && 'context' in sb) {
      return semeq(sa, sb);
    }
  }
  return false;
}

// ---- Cursor movement ----

function cursorDown(cursor: SemNode): SemNode | null {
  return childAt(cursor, 1);
}

function cursorNext(cursor: SemNode): SemNode | null {
  return nextSibling(cursor);
}

function cursorUp(cursor: SemNode, levels: number): SemNode | null {
  let n: SemNode | null = cursor;
  for (let i = 0; i < levels; i++) {
    if (!n) return null;
    n = getParent(n);
  }
  // After popping up, advance to next sibling
  if (n) {
    n = nextSibling(n);
  }
  return n;
}

function advanceCursor(cursor: SemNode, transition: number): SemNode | null {
  if (transition === TransitionDown) {
    return cursorDown(cursor);
  }
  if (isTransitionPop(transition)) {
    return cursorUp(cursor, -transition);
  }
  // TransitionNone or next sibling (transition === 0 means next)
  if (transition === 0) {
    return cursorNext(cursor);
  }
  // TransitionNone (0x8000) means stay — shouldn't move cursor
  return cursor;
}

// ---- Clone group captures ----

function cloneGroups(groups: GroupCapture[]): GroupCapture[] {
  return groups.map(g => ({
    ...g,
    children: cloneGroups(g.children),
  }));
}

// ---- Main match algorithm ----

function doMatch(startState: SState, tree: SemNode): { matched: boolean; groups: GroupCapture[] } {
  const stack: BranchPoint[] = [];
  let state: SState | null = startState;
  let cursor: SemNode | null = tree;
  let groups: GroupCapture[] = [];
  let openGroupStack: GroupCapture[] = [];

  while (state) {
    if (state.type === StateType.Match) {
      return { matched: true, groups };
    }

    if (!cursor && state.type !== StateType.GroupClose && state.type !== StateType.GroupOpen
        && state.type !== StateType.Walk && state.type !== StateType.Split
        && state.type !== StateType.Not && state.type !== StateType.Descend) {
      // No more tree to match — try backtracking
      if (!backtrack()) return { matched: false, groups: [] };
      continue;
    }

    switch (state.type) {
      case StateType.Symbol: {
        if (!cursor || !symbolMatches(state, cursor)) {
          if (!backtrack()) return { matched: false, groups: [] };
          continue;
        }
        const next = advanceCursor(cursor, state.transition);
        cursor = next;
        state = state.out;
        break;
      }

      case StateType.Value: {
        if (!cursor || !valueMatches(state, cursor)) {
          if (!backtrack()) return { matched: false, groups: [] };
          continue;
        }
        const next = advanceCursor(cursor, state.transition);
        cursor = next;
        state = state.out;
        break;
      }

      case StateType.Any: {
        if (!cursor) {
          if (!backtrack()) return { matched: false, groups: [] };
          continue;
        }
        const next = advanceCursor(cursor, state.transition);
        cursor = next;
        state = state.out;
        break;
      }

      case StateType.Split: {
        // Push alternate branch for backtracking
        stack.push({
          state: state,
          cursor: cursor,
          path: cursor ? getPath(cursor) : [],
          groups: cloneGroups(groups),
          walkNode: null,
          walkRoot: null,
        });
        // Take primary branch (out)
        state = state.out;
        break;
      }

      case StateType.GroupOpen: {
        if (state.data.kind !== 'groupOpen') throw new Error('Bad GroupOpen state');
        const capture: GroupCapture = {
          uid: state.data.groupOpen.uid,
          symbol: state.data.groupOpen.symbol,
          startPath: cursor ? getPath(cursor) : [],
          startNode: cursor,
          endNode: null,
          children: [],
        };
        openGroupStack.push(capture);
        state = state.out;
        break;
      }

      case StateType.GroupClose: {
        const capture = openGroupStack.pop();
        if (capture) {
          capture.endNode = cursor;
          // Count siblings matched
          if (openGroupStack.length > 0) {
            openGroupStack[openGroupStack.length - 1].children.push(capture);
          } else {
            groups.push(capture);
          }
        }
        state = state.out;
        break;
      }

      case StateType.Descend: {
        if (!cursor) {
          if (!backtrack()) return { matched: false, groups: [] };
          continue;
        }
        cursor = cursorDown(cursor);
        state = state.out;
        break;
      }

      case StateType.Walk: {
        // Walk: try matching from current position, if fail try next node in DFS
        if (!cursor) {
          if (!backtrack()) return { matched: false, groups: [] };
          continue;
        }
        // Push a walk backtrack point: if inner match fails, advance walk cursor
        stack.push({
          state: state,
          cursor: cursor,
          path: getPath(cursor),
          groups: cloneGroups(groups),
          walkNode: cursor,
          walkRoot: cursor,
        });
        state = state.out;
        break;
      }

      case StateType.Not: {
        // Not: try to match inner pattern. If it matches, overall fails. If it fails, succeed.
        const innerResult = doMatch(state.out!, cursor!);
        if (innerResult.matched) {
          // Inner matched, so NOT fails
          if (!backtrack()) return { matched: false, groups: [] };
        } else {
          // Inner didn't match, NOT succeeds — advance via out1
          state = state.out1;
        }
        continue;
      }

      default:
        throw new Error(`Unknown state type: ${state.type}`);
    }
  }

  return { matched: false, groups: [] };

  function backtrack(): boolean {
    while (stack.length > 0) {
      const bp = stack.pop()!;
      groups = bp.groups;
      openGroupStack = [];

      if (bp.state.type === StateType.Walk && bp.walkNode) {
        // Advance walk cursor to next node in DFS
        const nextWalk = nextInWalk(bp.walkNode);
        if (nextWalk) {
          cursor = nextWalk;
          // Push new walk point
          stack.push({
            state: bp.state,
            cursor: nextWalk,
            path: getPath(nextWalk),
            groups: cloneGroups(groups),
            walkNode: nextWalk,
            walkRoot: bp.walkRoot,
          });
          state = bp.state.out;
          return true;
        }
        // Walk exhausted, continue backtracking
        continue;
      }

      if (bp.state.type === StateType.Split) {
        // Take alternate branch (out1)
        cursor = bp.cursor;
        state = bp.state.out1;
        return true;
      }

      // Other backtrack point types — just restore and continue
      cursor = bp.cursor;
      state = bp.state;
      return true;
    }
    return false;
  }
}

// ---- Convert GroupCapture to MatchResult ----

function captureToResult(cap: GroupCapture, tree: SemNode): MatchResult {
  let siblingsCount = 0;
  if (cap.startNode && cap.endNode) {
    // Count siblings from start to end
    const startPath = getPath(cap.startNode);
    const endPath = cap.endNode ? getPath(cap.endNode) : startPath;
    if (startPath.length > 0 && endPath.length > 0) {
      const startIdx = startPath[startPath.length - 1];
      // endNode is the cursor AFTER the match, so the matched range is
      // from startIdx to (endIdx - 1) if they share a parent, otherwise count=1
      if (cap.endNode && cap.startNode.parent === cap.endNode.parent) {
        const endIdx = endPath[endPath.length - 1];
        siblingsCount = endIdx - startIdx;
      } else if (cap.endNode === null || cap.endNode === cap.startNode) {
        siblingsCount = 1;
      } else {
        // End cursor moved past — estimate count
        siblingsCount = countSiblingsBetween(cap.startNode, cap.endNode);
      }
    } else {
      siblingsCount = 1;
    }
  }
  if (siblingsCount <= 0) siblingsCount = 1;

  return {
    symbol: cap.symbol,
    path: cap.startPath,
    siblingsCount,
    children: cap.children.map(c => captureToResult(c, tree)),
  };
}

function countSiblingsBetween(start: SemNode, end: SemNode | null): number {
  let count = 0;
  let n: SemNode | null = start;
  while (n && n !== end) {
    count++;
    n = nextSibling(n);
  }
  return count || 1;
}

// ---- Public API ----

/**
 * Test if a semtrex pattern matches a tree. Returns boolean.
 */
export function match(semtrex: SemNode, tree: SemNode): boolean {
  const { start } = makeFA(semtrex);
  const result = doMatch(start, tree);
  return result.matched;
}

/**
 * Match a semtrex pattern against a tree, returning capture groups.
 * Returns null if no match.
 */
export function matchr(semtrex: SemNode, tree: SemNode): MatchResult[] | null {
  const { start } = makeFA(semtrex);
  const result = doMatch(start, tree);
  if (!result.matched) return null;
  return result.groups.map(g => captureToResult(g, tree));
}

/**
 * Get a specific capture group from match results by symbol.
 */
export function getMatchBySymbol(results: MatchResult[], symbol: SemanticID): MatchResult | undefined {
  for (const r of results) {
    if (semeq(r.symbol, symbol)) return r;
    const found = getMatchBySymbol(r.children, symbol);
    if (found) return found;
  }
  return undefined;
}

/**
 * Extract the matched subtree for a capture group.
 * Returns the nodes from the original tree covered by the match.
 */
export function getMatchedNodes(tree: SemNode, result: MatchResult): SemNode[] {
  const startNode = getByPath(tree, result.path);
  if (!startNode) return [];

  const nodes: SemNode[] = [startNode];
  let n: SemNode | null = startNode;
  for (let i = 1; i < result.siblingsCount; i++) {
    n = nextSibling(n!);
    if (n) nodes.push(n);
  }
  return nodes;
}
