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

/** Detach a specific child by reference. Throws if not a child. */
export function detachByPtr(parent: SemNode, child: SemNode): void {
  const idx = parent.children.indexOf(child);
  if (idx < 0) throw new Error('Node is not a child of the given parent');
  parent.children.splice(idx, 1);
  child.parent = null;
}

/** Change a node's symbol and surface in-place, preserving parent and children. */
export function morph(dst: SemNode, src: SemNode): void {
  dst.symbol = { ...src.symbol };
  dst.surface = cloneSurface(src.surface);
}

/** Replace a node's contents (symbol, surface, children) in-place, keeping its position in the tree. */
export function replaceNode(target: SemNode, replacement: SemNode): void {
  target.symbol = replacement.symbol;
  target.surface = replacement.surface;
  target.children = replacement.children;
  for (const c of target.children) {
    c.parent = target;
  }
  // Clear replacement to prevent shared references
  replacement.children = [];
  replacement.parent = null;
}

/** Insert a node at a path position, shifting existing siblings right. */
export function insertAt(r: SemNode, path: number[], node: SemNode): void {
  if (path.length === 0) throw new Error('Cannot insert at root path');
  const parentPath = path.slice(0, -1);
  const childIdx = path[path.length - 1]; // 1-indexed
  const parent = getByPath(r, parentPath);
  if (!parent) throw new Error(`Invalid path: parent not found`);
  // Detach from current parent if needed
  if (node.parent) {
    const ri = node.parent.children.indexOf(node);
    if (ri >= 0) node.parent.children.splice(ri, 1);
  }
  node.parent = parent;
  // Insert at 0-indexed position (childIdx - 1), shifting right
  const zeroIdx = childIdx - 1;
  if (zeroIdx >= parent.children.length) {
    parent.children.push(node);
  } else {
    parent.children.splice(zeroIdx, 0, node);
  }
}

// --- Hashing ---

/**
 * FNV-1a 32-bit hash. Fast, good distribution, no dependencies.
 */
function fnv1a(data: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // ensure unsigned
}

function hashCombine(a: number, b: number): number {
  // Boost-style hash combine
  return (a ^ (b + 0x9e3779b9 + (a << 6) + (a >>> 2))) >>> 0;
}

function surfaceToBytes(s: Surface): Uint8Array {
  if (s === null) return new Uint8Array(0);
  if (typeof s === 'number') {
    const buf = new ArrayBuffer(8);
    new Float64Array(buf)[0] = s;
    return new Uint8Array(buf);
  }
  if (typeof s === 'string') {
    return new TextEncoder().encode(s);
  }
  if (typeof s === 'boolean') {
    return new Uint8Array([s ? 1 : 0]);
  }
  if (s instanceof Uint8Array) return s;
  // SemanticID
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setInt32(0, s.context);
  view.setInt32(4, s.semtype);
  view.setInt32(8, s.id);
  return new Uint8Array(buf);
}

function symbolToBytes(sym: SemanticID): Uint8Array {
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setInt32(0, sym.context);
  view.setInt32(4, sym.semtype);
  view.setInt32(8, sym.id);
  return new Uint8Array(buf);
}

/**
 * Compute a recursive content hash of a tree.
 * Hash covers symbol + surface + all children's hashes.
 */
export function treeHash(node: SemNode): number {
  let h = fnv1a(symbolToBytes(node.symbol));
  h = hashCombine(h, fnv1a(surfaceToBytes(node.surface)));
  for (const c of node.children) {
    h = hashCombine(h, treeHash(c));
  }
  return h;
}

// --- Binary serialization ---

/**
 * Surface type tags for binary serialization.
 */
const enum SurfaceTag {
  Null = 0,
  Number = 1,
  String = 2,
  Boolean = 3,
  Uint8Array = 4,
  SemanticID = 5,
}

/**
 * Serialize a tree to a compact binary format.
 *
 * Wire format per node:
 *   [symbol: 12 bytes (3×i32)] [childCount: u32] [surfaceTag: u8] [surface bytes] [children...]
 */
export function treeSerialize(node: SemNode): Uint8Array {
  const parts: Uint8Array[] = [];
  serializeNode(node, parts);
  // Concatenate all parts
  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

function serializeNode(node: SemNode, parts: Uint8Array[]): void {
  // Symbol (12 bytes) + childCount (4 bytes) = 16 byte header
  const header = new ArrayBuffer(16);
  const hv = new DataView(header);
  hv.setInt32(0, node.symbol.context);
  hv.setInt32(4, node.symbol.semtype);
  hv.setInt32(8, node.symbol.id);
  hv.setUint32(12, node.children.length);
  parts.push(new Uint8Array(header));

  // Surface
  serializeSurface(node.surface, parts);

  // Children
  for (const c of node.children) {
    serializeNode(c, parts);
  }
}

function serializeSurface(s: Surface, parts: Uint8Array[]): void {
  if (s === null) {
    parts.push(new Uint8Array([SurfaceTag.Null]));
    return;
  }
  if (typeof s === 'number') {
    const buf = new ArrayBuffer(9);
    const view = new DataView(buf);
    view.setUint8(0, SurfaceTag.Number);
    view.setFloat64(1, s);
    parts.push(new Uint8Array(buf));
    return;
  }
  if (typeof s === 'string') {
    const encoded = new TextEncoder().encode(s);
    const buf = new ArrayBuffer(5);
    const view = new DataView(buf);
    view.setUint8(0, SurfaceTag.String);
    view.setUint32(1, encoded.length);
    parts.push(new Uint8Array(buf));
    parts.push(encoded);
    return;
  }
  if (typeof s === 'boolean') {
    parts.push(new Uint8Array([SurfaceTag.Boolean, s ? 1 : 0]));
    return;
  }
  if (s instanceof Uint8Array) {
    const buf = new ArrayBuffer(5);
    const view = new DataView(buf);
    view.setUint8(0, SurfaceTag.Uint8Array);
    view.setUint32(1, s.length);
    parts.push(new Uint8Array(buf));
    parts.push(s);
    return;
  }
  // SemanticID
  const buf = new ArrayBuffer(13);
  const view = new DataView(buf);
  view.setUint8(0, SurfaceTag.SemanticID);
  view.setInt32(1, s.context);
  view.setInt32(5, s.semtype);
  view.setInt32(9, s.id);
  parts.push(new Uint8Array(buf));
}

/**
 * Deserialize a tree from binary format (inverse of treeSerialize).
 */
export function treeDeserialize(data: Uint8Array): SemNode {
  const offset = { value: 0 };
  return deserializeNode(data, offset, null);
}

function deserializeNode(data: Uint8Array, offset: { value: number }, parent: SemNode | null): SemNode {
  const view = new DataView(data.buffer, data.byteOffset + offset.value);
  const context = view.getInt32(0);
  const semtype = view.getInt32(4);
  const id = view.getInt32(8);
  const childCount = view.getUint32(12);
  offset.value += 16;

  const surface = deserializeSurface(data, offset);

  const node: SemNode = {
    symbol: { context, semtype, id },
    surface,
    children: [],
    parent,
  };

  for (let i = 0; i < childCount; i++) {
    node.children.push(deserializeNode(data, offset, node));
  }

  return node;
}

function deserializeSurface(data: Uint8Array, offset: { value: number }): Surface {
  const tag = data[offset.value++];
  const view = new DataView(data.buffer, data.byteOffset);

  switch (tag) {
    case SurfaceTag.Null:
      return null;
    case SurfaceTag.Number: {
      const v = view.getFloat64(offset.value);
      offset.value += 8;
      return v;
    }
    case SurfaceTag.String: {
      const len = view.getUint32(offset.value);
      offset.value += 4;
      const str = new TextDecoder().decode(data.subarray(offset.value, offset.value + len));
      offset.value += len;
      return str;
    }
    case SurfaceTag.Boolean: {
      const v = data[offset.value++];
      return v !== 0;
    }
    case SurfaceTag.Uint8Array: {
      const len = view.getUint32(offset.value);
      offset.value += 4;
      const arr = new Uint8Array(data.subarray(offset.value, offset.value + len));
      offset.value += len;
      return arr;
    }
    case SurfaceTag.SemanticID: {
      const ctx = view.getInt32(offset.value);
      const st = view.getInt32(offset.value + 4);
      const i = view.getInt32(offset.value + 8);
      offset.value += 12;
      return { context: ctx, semtype: st, id: i };
    }
    default:
      throw new Error(`Unknown surface tag: ${tag}`);
  }
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

/** JSON-serializable form of a SemNode (output of treeToJSON). */
export interface SemNodeJSON {
  symbol: SemanticID;
  label?: string;
  surface?: number | string | boolean | SemanticID | number[];
  children?: SemNodeJSON[];
}

/** Convert tree to a plain JSON-serializable object. */
export function treeToJSON(node: SemNode, sem?: SemTableLike): SemNodeJSON {
  const label = sem?.getSymbolLabel(node.symbol);
  const result: SemNodeJSON = {
    symbol: { ...node.symbol },
  };
  if (label) result.label = label;
  if (node.surface !== null) {
    result.surface = node.surface instanceof Uint8Array
      ? Array.from(node.surface)
      : node.surface;
  }
  if (node.children.length > 0) {
    result.children = node.children.map(c => treeToJSON(c, sem));
  }
  return result;
}

/** Reconstruct a SemNode tree from JSON (inverse of treeToJSON). */
export function treeFromJSON(json: SemNodeJSON, parent: SemNode | null = null): SemNode {
  let surface: Surface;
  if (json.surface === undefined || json.surface === null) {
    surface = null;
  } else if (Array.isArray(json.surface)) {
    surface = new Uint8Array(json.surface);
  } else {
    surface = json.surface as number | string | boolean | SemanticID;
  }
  const node: SemNode = {
    symbol: { ...json.symbol },
    surface,
    children: [],
    parent,
  };
  if (json.children) {
    for (const childJson of json.children) {
      node.children.push(treeFromJSON(childJson, node));
    }
  }
  return node;
}

// --- Tree walking utility ---

/** Depth-first walk of all nodes. Calls fn(node) for each. */
export function walk(node: SemNode, fn: (n: SemNode) => void): void {
  fn(node);
  for (const c of node.children) walk(c, fn);
}

// --- Tree from string ---

export interface SemTableForParse {
  getSymbolLabel(sid: SemanticID): string | undefined;
  symbolByName(name: string): SemanticID | undefined;
}

/**
 * Parse a human-readable tree string back into a SemNode.
 * Inverse of treeToString. Format: (LABEL:surface child1 child2 ...)
 *
 * Supports:
 *   (LABEL)                   — null surface, no children
 *   (LABEL:42)                — integer surface
 *   (LABEL:3.14)              — float surface
 *   (LABEL:"hello")           — string surface
 *   (LABEL:true)              — boolean surface
 *   (LABEL:{1,2,3})           — SemanticID surface
 *   (LABEL:null)              — explicit null surface
 *   (LABEL child1 child2)     — children, null surface
 *   (LABEL:val child1 child2) — surface + children
 */
export function treeFromString(input: string, sem: SemTableForParse): SemNode {
  const trimmed = input.trim();
  const ctx = { pos: 0, input: trimmed, sem };
  const node = parseTreeNode(ctx, null);
  if (ctx.pos < trimmed.length) {
    throw new Error(`Unexpected content at position ${ctx.pos}`);
  }
  return node;
}

interface ParseCtx {
  pos: number;
  input: string;
  sem: SemTableForParse;
}

function skipWhitespace(ctx: ParseCtx): void {
  while (ctx.pos < ctx.input.length && /\s/.test(ctx.input[ctx.pos])) ctx.pos++;
}

function parseTreeNode(ctx: ParseCtx, parent: SemNode | null): SemNode {
  skipWhitespace(ctx);
  if (ctx.input[ctx.pos] !== '(') {
    throw new Error(`Expected '(' at position ${ctx.pos}, got '${ctx.input[ctx.pos]}'`);
  }
  ctx.pos++; // skip '('
  skipWhitespace(ctx);

  // Read label
  const labelStart = ctx.pos;
  while (ctx.pos < ctx.input.length && /[a-zA-Z0-9_]/.test(ctx.input[ctx.pos])) ctx.pos++;
  const label = ctx.input.slice(labelStart, ctx.pos);
  if (!label) throw new Error(`Expected label at position ${labelStart}`);

  const symbol = ctx.sem.symbolByName(label);
  if (!symbol) throw new Error(`Unknown symbol '${label}' at position ${labelStart}`);

  // Check for surface after ':'
  let surface: Surface = null;
  skipWhitespace(ctx);
  if (ctx.input[ctx.pos] === ':') {
    ctx.pos++; // skip ':'
    surface = parseSurface(ctx);
  }

  const node: SemNode = { symbol, surface, children: [], parent };
  if (parent) {
    parent.children.push(node);
  }

  // Parse children
  skipWhitespace(ctx);
  while (ctx.pos < ctx.input.length && ctx.input[ctx.pos] === '(') {
    parseTreeNode(ctx, node);
    skipWhitespace(ctx);
  }

  // Expect closing ')'
  if (ctx.input[ctx.pos] !== ')') {
    throw new Error(`Expected ')' at position ${ctx.pos}, got '${ctx.input[ctx.pos] ?? 'EOF'}'`);
  }
  ctx.pos++; // skip ')'
  return node;
}

function parseSurface(ctx: ParseCtx): Surface {
  skipWhitespace(ctx);
  const c = ctx.input[ctx.pos];

  // String: "..."
  if (c === '"') {
    ctx.pos++;
    let s = '';
    while (ctx.pos < ctx.input.length && ctx.input[ctx.pos] !== '"') {
      if (ctx.input[ctx.pos] === '\\') {
        ctx.pos++;
        const esc = ctx.input[ctx.pos];
        if (esc === 'n') s += '\n';
        else if (esc === 't') s += '\t';
        else if (esc === '\\') s += '\\';
        else if (esc === '"') s += '"';
        else s += esc;
      } else {
        s += ctx.input[ctx.pos];
      }
      ctx.pos++;
    }
    if (ctx.input[ctx.pos] !== '"') throw new Error(`Unterminated string at position ${ctx.pos}`);
    ctx.pos++; // skip closing "
    return s;
  }

  // SemanticID: {ctx,semtype,id}
  if (c === '{') {
    ctx.pos++;
    const parts = readUntil(ctx, '}').split(',').map(s => parseInt(s.trim(), 10));
    ctx.pos++; // skip '}'
    if (parts.length !== 3) throw new Error('SemanticID must have 3 parts');
    return { context: parts[0], semtype: parts[1], id: parts[2] };
  }

  // null
  if (ctx.input.startsWith('null', ctx.pos)) {
    const after = ctx.input[ctx.pos + 4];
    if (!after || after === ')' || /\s/.test(after)) {
      ctx.pos += 4;
      return null;
    }
  }

  // true/false
  if (ctx.input.startsWith('true', ctx.pos)) {
    const after = ctx.input[ctx.pos + 4];
    if (!after || after === ')' || /\s/.test(after)) {
      ctx.pos += 4;
      return true;
    }
  }
  if (ctx.input.startsWith('false', ctx.pos)) {
    const after = ctx.input[ctx.pos + 5];
    if (!after || after === ')' || /\s/.test(after)) {
      ctx.pos += 5;
      return false;
    }
  }

  // Number (int or float, possibly negative)
  if ((c >= '0' && c <= '9') || c === '-') {
    const start = ctx.pos;
    if (c === '-') ctx.pos++;
    while (ctx.pos < ctx.input.length && ctx.input[ctx.pos] >= '0' && ctx.input[ctx.pos] <= '9') ctx.pos++;
    if (ctx.input[ctx.pos] === '.') {
      ctx.pos++;
      while (ctx.pos < ctx.input.length && ctx.input[ctx.pos] >= '0' && ctx.input[ctx.pos] <= '9') ctx.pos++;
      return parseFloat(ctx.input.slice(start, ctx.pos));
    }
    return parseInt(ctx.input.slice(start, ctx.pos), 10);
  }

  // Blob: <blob:N>  — read as empty Uint8Array of given length
  if (c === '<') {
    const end = ctx.input.indexOf('>', ctx.pos);
    if (end < 0) throw new Error('Unterminated blob literal');
    const inner = ctx.input.slice(ctx.pos + 1, end);
    ctx.pos = end + 1;
    const match = inner.match(/^blob:(\d+)$/);
    if (match) return new Uint8Array(parseInt(match[1], 10));
    throw new Error(`Unknown literal: <${inner}>`);
  }

  throw new Error(`Cannot parse surface at position ${ctx.pos}: '${c}'`);
}

function readUntil(ctx: ParseCtx, terminator: string): string {
  const start = ctx.pos;
  while (ctx.pos < ctx.input.length && ctx.input[ctx.pos] !== terminator) ctx.pos++;
  return ctx.input.slice(start, ctx.pos);
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
