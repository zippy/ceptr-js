/**
 * Thompson NFA construction from semtrex trees.
 *
 * Ported from ceptr/src/semtrex.c __stx_makeFA / _stx_makeFA.
 *
 * Builds a finite state automaton from a semtrex tree for use by the matcher.
 * Uses the same Thompson construction approach as the C implementation
 * (inspired by Russ Cox's "Regular Expression Matching Can Be Simple and Fast").
 */

import { type SemanticID, semeq } from './semantic-id.js';
import { type SemNode, childAt, childCount, clone } from './tree.js';
import { SYMBOLS } from './base-defs.js';
import {
  type SState, StateType, TransitionDown, TransitionNone,
  createState, matchState,
  LITERAL_NOT, LITERAL_SET,
} from './semtrex-types.js';

let groupIdCounter = 0;

interface FAFragment {
  start: SState;
  outputs: PatchTarget[];
}

/** A PatchTarget is a reference to an SState field that needs to be patched. */
interface PatchTarget {
  state: SState;
  field: 'out' | 'out1';
}

function patch(targets: PatchTarget[], dest: SState, level: number): void {
  for (const t of targets) {
    t.state[t.field] = dest;
    // Adjust the transition by adding -level (matching C's `*tr += -level`).
    // This adjusts relative depth so transitions pop to the right place.
    // Only adjust if not TransitionNone (0x8000).
    const trField = t.field === 'out' ? 'transition' : 'transition1';
    if (t.state[trField] !== TransitionNone) {
      t.state[trField] += -level;
      // If result is 0 and state doesn't consume a node, set to TransitionNone
      if (t.state[trField] === 0
          && t.state.type !== StateType.Symbol
          && t.state.type !== StateType.Any
          && t.state.type !== StateType.Value) {
        t.state[trField] = TransitionNone;
      }
    }
  }
}

function list1(state: SState, field: 'out' | 'out1'): PatchTarget[] {
  return [{ state, field }];
}

function append(a: PatchTarget[], b: PatchTarget[]): PatchTarget[] {
  return [...a, ...b];
}

function buildFA(t: SemNode, level: number, stateCount: { count: number }): FAFragment {
  const sym = t.symbol;
  const c = childCount(t);

  // SEMTREX_VALUE_LITERAL / SEMTREX_VALUE_LITERAL_NOT
  if (semeq(sym, SYMBOLS.SEMTREX_VALUE_LITERAL) || semeq(sym, SYMBOLS.SEMTREX_VALUE_LITERAL_NOT)) {
    const s = createState(StateType.Value);
    stateCount.count++;
    const isNot = semeq(sym, SYMBOLS.SEMTREX_VALUE_LITERAL_NOT);
    let flags = isNot ? LITERAL_NOT : 0;

    const v = childAt(t, 1);
    if (!v) throw new Error('SEMTREX_VALUE_LITERAL must have a child');
    if (semeq(v.symbol, SYMBOLS.SEMTREX_VALUE_SET)) flags |= LITERAL_SET;

    s.data = { kind: 'value', value: { flags, values: clone(v) } };
    s.transition = level;
    return { start: s, outputs: list1(s, 'out') };
  }

  // SEMTREX_SYMBOL_LITERAL / SEMTREX_SYMBOL_LITERAL_NOT
  if (semeq(sym, SYMBOLS.SEMTREX_SYMBOL_LITERAL) || semeq(sym, SYMBOLS.SEMTREX_SYMBOL_LITERAL_NOT)) {
    const s = createState(StateType.Symbol);
    stateCount.count++;
    const isNot = semeq(sym, SYMBOLS.SEMTREX_SYMBOL_LITERAL_NOT);
    let flags = isNot ? LITERAL_NOT : 0;

    const v = childAt(t, 1);
    if (!v) throw new Error('SEMTREX_SYMBOL_LITERAL must have a child');
    if (semeq(v.symbol, SYMBOLS.SEMTREX_SYMBOL_SET)) flags |= LITERAL_SET;

    s.data = { kind: 'symbol', symbol: { flags, symbols: clone(v) } };

    if (c > 1) {
      // Has child pattern to match after descending
      s.transition = TransitionDown;
      const inner = buildFA(childAt(t, 2)!, level - 1, stateCount);
      s.out = inner.start;
      return { start: s, outputs: inner.outputs };
    } else {
      s.transition = level;
      return { start: s, outputs: list1(s, 'out') };
    }
  }

  // SEMTREX_SYMBOL_ANY
  if (semeq(sym, SYMBOLS.SEMTREX_SYMBOL_ANY)) {
    const s = createState(StateType.Any);
    stateCount.count++;

    if (c > 0) {
      s.transition = TransitionDown;
      const inner = buildFA(childAt(t, 1)!, level - 1, stateCount);
      s.out = inner.start;
      return { start: s, outputs: inner.outputs };
    } else {
      s.transition = level;
      return { start: s, outputs: list1(s, 'out') };
    }
  }

  // SEMTREX_SEQUENCE
  if (semeq(sym, SYMBOLS.SEMTREX_SEQUENCE)) {
    if (c === 0) throw new Error('Sequence must have children');

    // Build right-to-left and chain
    let last: SState | null = null;
    let lastOutputs: PatchTarget[] = [];
    let start: SState | null = null;

    for (let x = c; x >= 1; x--) {
      const frag = buildFA(childAt(t, x)!, level, stateCount);
      if (last) {
        patch(frag.outputs, last, level);
      } else {
        lastOutputs = frag.outputs;
      }
      last = frag.start;
      start = frag.start;
    }

    return { start: start!, outputs: lastOutputs };
  }

  // SEMTREX_OR
  if (semeq(sym, SYMBOLS.SEMTREX_OR)) {
    if (c !== 2) throw new Error('Or must have 2 children');
    const s = createState(StateType.Split);
    stateCount.count++;

    const left = buildFA(childAt(t, 1)!, level, stateCount);
    const right = buildFA(childAt(t, 2)!, level, stateCount);

    s.out = left.start;
    s.out1 = right.start;
    return { start: s, outputs: append(left.outputs, right.outputs) };
  }

  // SEMTREX_ZERO_OR_MORE (star)
  if (semeq(sym, SYMBOLS.SEMTREX_ZERO_OR_MORE)) {
    if (c !== 1) throw new Error('Star must have 1 child');
    const s = createState(StateType.Split);
    stateCount.count++;

    const inner = buildFA(childAt(t, 1)!, level, stateCount);
    s.out = inner.start;
    patch(inner.outputs, s, level);
    return { start: s, outputs: list1(s, 'out1') };
  }

  // SEMTREX_ONE_OR_MORE (plus)
  if (semeq(sym, SYMBOLS.SEMTREX_ONE_OR_MORE)) {
    if (c !== 1) throw new Error('Plus must have 1 child');
    const s = createState(StateType.Split);
    stateCount.count++;

    const inner = buildFA(childAt(t, 1)!, level, stateCount);
    s.out = inner.start;
    patch(inner.outputs, s, level);
    return { start: inner.start, outputs: list1(s, 'out1') };
  }

  // SEMTREX_ZERO_OR_ONE (question)
  if (semeq(sym, SYMBOLS.SEMTREX_ZERO_OR_ONE)) {
    if (c !== 1) throw new Error('Question must have 1 child');
    const s = createState(StateType.Split);
    stateCount.count++;

    const inner = buildFA(childAt(t, 1)!, level, stateCount);
    s.out = inner.start;
    return { start: s, outputs: append(inner.outputs, list1(s, 'out1')) };
  }

  // SEMTREX_GROUP
  if (semeq(sym, SYMBOLS.SEMTREX_GROUP)) {
    if (c !== 1) throw new Error('Group must have 1 child');

    const openState = createState(StateType.GroupOpen);
    stateCount.count++;
    const groupSymbol = t.surface as SemanticID;
    const groupId = ++groupIdCounter;
    openState.data = { kind: 'groupOpen', groupOpen: { symbol: groupSymbol, uid: groupId } };

    const inner = buildFA(childAt(t, 1)!, level, stateCount);
    openState.out = inner.start;

    const closeState = createState(StateType.GroupClose);
    stateCount.count++;
    closeState.data = { kind: 'groupClose', groupClose: { openState } };

    patch(inner.outputs, closeState, level);
    return { start: openState, outputs: list1(closeState, 'out') };
  }

  // SEMTREX_DESCEND
  if (semeq(sym, SYMBOLS.SEMTREX_DESCEND)) {
    if (c !== 1) throw new Error('Descend must have 1 child');
    const s = createState(StateType.Descend);
    stateCount.count++;

    const inner = buildFA(childAt(t, 1)!, level - 1, stateCount);
    s.out = inner.start;
    return { start: s, outputs: inner.outputs };
  }

  // SEMTREX_NOT
  if (semeq(sym, SYMBOLS.SEMTREX_NOT)) {
    if (c !== 1) throw new Error('Not must have 1 child');
    const s = createState(StateType.Not);
    stateCount.count++;

    const inner = buildFA(childAt(t, 1)!, level, stateCount);
    s.out = inner.start;
    return { start: s, outputs: append(inner.outputs, list1(s, 'out1')) };
  }

  // SEMTREX_WALK
  if (semeq(sym, SYMBOLS.SEMTREX_WALK)) {
    if (c !== 1) throw new Error('Walk must have 1 child');
    const s = createState(StateType.Walk);
    stateCount.count++;

    const inner = buildFA(childAt(t, 1)!, level, stateCount);
    s.out = inner.start;
    return { start: s, outputs: inner.outputs };
  }

  throw new Error(`Unknown semtrex symbol: ${JSON.stringify(sym)}`);
}

/**
 * Build a finite state automaton from a semtrex tree.
 *
 * @param semtrexTree - A SemNode tree with SEMTREX_* symbols
 * @returns The start state and total state count
 */
export function makeFA(semtrexTree: SemNode): { start: SState; stateCount: number } {
  groupIdCounter = 0;
  const stateCount = { count: 0 };
  const frag = buildFA(semtrexTree, 0, stateCount);
  patch(frag.outputs, matchState, 0);
  return { start: frag.start, stateCount: stateCount.count };
}
