/**
 * Semantic tree nodes — the universal data structure.
 *
 * Ported from ceptr/src/tree.h and tree.c
 *
 * Every node carries a SemanticID (its symbol) and a surface value.
 * Children are ordered. Paths are 1-indexed number arrays.
 */

import { type SemanticID, semeq, NULL_SYMBOL } from './semantic-id.js';

export type Surface = number | string | boolean | SemanticID | Uint8Array | null;

export interface SemNode {
  symbol: SemanticID;
  surface: Surface;
  children: SemNode[];
  parent: SemNode | null;
}

// --- Creation ---

function makeNode(parent: SemNode | null, symbol: SemanticID, surface: Surface): SemNode {
  const node: SemNode = { symbol, surface, children: [], parent };
  if (parent) {
    parent.children.push(node);
  }
  return node;
}

/** Create a node with any surface, appended as child of parent (or root if null). */
export function newNode(parent: SemNode | null, symbol: SemanticID, surface: Surface): SemNode {
  return makeNode(parent, symbol, surface);
}

/** Create a node with integer surface. */
export function newInt(parent: SemNode | null, symbol: SemanticID, value: number): SemNode {
  return makeNode(parent, symbol, value);
}

/** Create a node with string surface. */
export function newStr(parent: SemNode | null, symbol: SemanticID, value: string): SemNode {
  return makeNode(parent, symbol, value);
}

/** Create a node whose surface is a SemanticID. */
export function newSym(parent: SemNode | null, symbol: SemanticID, value: SemanticID): SemNode {
  return makeNode(parent, symbol, value);
}

/** Create a root node (no parent, null surface). */
export function newRoot(symbol: SemanticID): SemNode {
  return makeNode(null, symbol, null);
}

/** Create a node with null surface, appended to parent. */
export function newEmpty(parent: SemNode | null, symbol: SemanticID): SemNode {
  return makeNode(parent, symbol, null);
}

// --- Navigation ---

/** Get the nth child (1-indexed). Returns null if out of bounds. */
export function childAt(node: SemNode, index: number): SemNode | null {
  return node.children[index - 1] ?? null;
}

/** Get parent node. */
export function getParent(node: SemNode): SemNode | null {
  return node.parent;
}

/** Walk up to root. */
export function root(node: SemNode): SemNode {
  let n = node;
  while (n.parent) n = n.parent;
  return n;
}

/** Get next sibling (null if last or no parent). */
export function nextSibling(node: SemNode): SemNode | null {
  if (!node.parent) return null;
  const idx = node.parent.children.indexOf(node);
  return node.parent.children[idx + 1] ?? null;
}

/** Get 1-indexed position in parent's children. 0 if root. */
export function nodeIndex(node: SemNode): number {
  if (!node.parent) return 0;
  return node.parent.children.indexOf(node) + 1;
}

/** Number of children. */
export function childCount(node: SemNode): number {
  return node.children.length;
}

// --- Path operations ---

/**
 * Compute path from root to this node.
 * Returns 1-indexed path array. Empty array for root.
 */
export function getPath(node: SemNode): number[] {
  const path: number[] = [];
  let n = node;
  while (n.parent) {
    path.unshift(n.parent.children.indexOf(n) + 1);
    n = n.parent;
  }
  return path;
}

/**
 * Navigate tree by path (1-indexed). Returns null if path is invalid.
 */
export function getByPath(r: SemNode, path: number[]): SemNode | null {
  let node: SemNode | null = r;
  for (const idx of path) {
    if (!node) return null;
    node = node.children[idx - 1] ?? null;
  }
  return node;
}

/** Compare two paths for equality. */
export function pathEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// --- Mutation ---

/** Deep clone a tree. The clone has no parent. */
export function clone(node: SemNode): SemNode {
  const cloned: SemNode = {
    symbol: { ...node.symbol },
    surface: cloneSurface(node.surface),
    children: [],
    parent: null,
  };
  for (const child of node.children) {
    const cc = clone(child);
    cc.parent = cloned;
    cloned.children.push(cc);
  }
  return cloned;
}

function cloneSurface(s: Surface): Surface {
  if (s === null || typeof s !== 'object') return s;
  if (s instanceof Uint8Array) return new Uint8Array(s);
  // SemanticID
  return { ...s };
}

/** Detach child at 1-indexed position. Returns the detached node. */
export function detach(parent: SemNode, index: number): SemNode {
  const child = parent.children[index - 1];
  if (!child) throw new RangeError(`No child at index ${index}`);
  parent.children.splice(index - 1, 1);
  child.parent = null;
  return child;
}

/** Replace child at 1-indexed position with newNode. Returns old child (detached). */
export function replaceChild(parent: SemNode, index: number, replacement: SemNode): SemNode {
  const old = parent.children[index - 1];
  if (!old) throw new RangeError(`No child at index ${index}`);
  // detach replacement from its current parent
  if (replacement.parent) {
    const ri = replacement.parent.children.indexOf(replacement);
    if (ri >= 0) replacement.parent.children.splice(ri, 1);
  }
  parent.children[index - 1] = replacement;
  replacement.parent = parent;
  old.parent = null;
  return old;
}

/** Append a node as last child. Detaches from previous parent if needed. */
export function addChild(parent: SemNode, child: SemNode): void {
  if (child.parent) {
    const idx = child.parent.children.indexOf(child);
    if (idx >= 0) child.parent.children.splice(idx, 1);
  }
  child.parent = parent;
  parent.children.push(child);
}

/** Find first child with matching symbol. Returns null if not found. */
export function findChild(parent: SemNode, symbol: SemanticID): SemNode | null {
  for (const c of parent.children) {
    if (semeq(c.symbol, symbol)) return c;
  }
  return null;
}

// --- Serialization ---

export interface SemTableLike {
  getSymbolLabel(sid: SemanticID): string | undefined;
}

/** Human-readable tree dump (like _t2s). */
export function treeToString(node: SemNode, sem?: SemTableLike, indent = 0): string {
  const label = sem?.getSymbolLabel(node.symbol) ?? `${node.symbol.context}:${node.symbol.semtype}:${node.symbol.id}`;
  const surfStr = node.surface !== null ? `:${formatSurface(node.surface)}` : '';
  const prefix = '  '.repeat(indent);
  let s = `${prefix}(${label}${surfStr}`;
  if (node.children.length > 0) {
    s += '\n';
    for (const c of node.children) {
      s += treeToString(c, sem, indent + 1) + '\n';
    }
    s += `${prefix})`;
  } else {
    s += ')';
  }
  return s;
}

function formatSurface(s: Surface): string {
  if (s === null) return 'null';
  if (typeof s === 'string') return JSON.stringify(s);
  if (typeof s === 'number') return String(s);
  if (typeof s === 'boolean') return String(s);
  if (s instanceof Uint8Array) return `<blob:${s.length}>`;
  // SemanticID
  return `{${s.context},${s.semtype},${s.id}}`;
}

/** Convert tree to a plain JSON-serializable object. */
export function treeToJSON(node: SemNode, sem?: SemTableLike): object {
  const label = sem?.getSymbolLabel(node.symbol);
  const obj: Record<string, unknown> = {
    symbol: { ...node.symbol },
  };
  if (label) obj.label = label;
  if (node.surface !== null) {
    obj.surface = node.surface instanceof Uint8Array
      ? Array.from(node.surface)
      : node.surface;
  }
  if (node.children.length > 0) {
    obj.children = node.children.map(c => treeToJSON(c, sem));
  }
  return obj;
}

// --- Tree walking utility ---

/** Depth-first walk of all nodes. Calls fn(node) for each. */
export function walk(node: SemNode, fn: (n: SemNode) => void): void {
  fn(node);
  for (const c of node.children) walk(c, fn);
}

/** Get next node in depth-first order. Returns null when walk is complete. */
export function nextInWalk(node: SemNode): SemNode | null {
  // If has children, go to first child
  if (node.children.length > 0) return node.children[0];
  // Otherwise go to next sibling, or walk up
  let n: SemNode | null = node;
  while (n) {
    const sib = nextSibling(n);
    if (sib) return sib;
    n = n.parent;
  }
  return null;
}
