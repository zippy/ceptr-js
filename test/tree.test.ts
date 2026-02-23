import { describe, it, expect } from 'vitest';
import { sid, SemanticType, semeq, NULL_SYMBOL } from '../src/semantic-id.js';
import {
  newRoot, newNode, newInt, newStr, newSym, newEmpty,
  childAt, getParent, root, nextSibling, nodeIndex, childCount,
  getPath, getByPath, pathEqual,
  clone, detach, replaceChild, addChild, findChild,
  treeToString, treeToJSON, walk, nextInWalk,
  type SemNode,
} from '../src/tree.js';

const SYM = (id: number) => sid(0, SemanticType.SYMBOL, id);
const TEST_ROOT = SYM(100);
const SY1 = SYM(1);
const SY2 = SYM(2);
const SY3 = SYM(3);
const SY11 = SYM(11);
const SY111 = SYM(111);

/** Build the canonical test tree from ceptr specs:
 *  TEST_ROOT("t")
 *    SY1("t1")
 *      SY11("t11")
 *        SY111("t111")
 *    SY2("t2")
 *    SY3("t3")
 */
function makeTestTree(): SemNode {
  const t = newStr(null, TEST_ROOT, 't');
  const t1 = newStr(t, SY1, 't1');
  const t11 = newStr(t1, SY11, 't11');
  newStr(t11, SY111, 't111');
  newStr(t, SY2, 't2');
  newStr(t, SY3, 't3');
  return t;
}

describe('Tree creation', () => {
  it('creates root node', () => {
    const r = newRoot(TEST_ROOT);
    expect(semeq(r.symbol, TEST_ROOT)).toBe(true);
    expect(r.surface).toBeNull();
    expect(r.parent).toBeNull();
    expect(r.children).toHaveLength(0);
  });

  it('creates nodes with various surface types', () => {
    const r = newRoot(TEST_ROOT);
    const ni = newInt(r, SY1, 42);
    const ns = newStr(r, SY2, 'hello');
    const nsym = newSym(r, SY3, SY1);
    const ne = newEmpty(r, SYM(4));

    expect(ni.surface).toBe(42);
    expect(ns.surface).toBe('hello');
    expect(semeq(nsym.surface as any, SY1)).toBe(true);
    expect(ne.surface).toBeNull();
    expect(r.children).toHaveLength(4);
  });

  it('sets parent back-references', () => {
    const r = newRoot(TEST_ROOT);
    const c = newInt(r, SY1, 1);
    expect(c.parent).toBe(r);
    expect(r.children[0]).toBe(c);
  });
});

describe('Tree navigation', () => {
  it('childAt is 1-indexed', () => {
    const t = makeTestTree();
    expect(childAt(t, 1)!.surface).toBe('t1');
    expect(childAt(t, 2)!.surface).toBe('t2');
    expect(childAt(t, 3)!.surface).toBe('t3');
    expect(childAt(t, 0)).toBeNull();
    expect(childAt(t, 4)).toBeNull();
  });

  it('getParent and root', () => {
    const t = makeTestTree();
    const t111 = childAt(childAt(childAt(t, 1)!, 1)!, 1)!;
    expect(t111.surface).toBe('t111');
    expect(getParent(t111)!.surface).toBe('t11');
    expect(root(t111)).toBe(t);
  });

  it('nextSibling', () => {
    const t = makeTestTree();
    expect(nextSibling(childAt(t, 1)!)!.surface).toBe('t2');
    expect(nextSibling(childAt(t, 2)!)!.surface).toBe('t3');
    expect(nextSibling(childAt(t, 3)!)).toBeNull();
  });

  it('nodeIndex', () => {
    const t = makeTestTree();
    expect(nodeIndex(t)).toBe(0); // root
    expect(nodeIndex(childAt(t, 1)!)).toBe(1);
    expect(nodeIndex(childAt(t, 2)!)).toBe(2);
    expect(nodeIndex(childAt(t, 3)!)).toBe(3);
  });

  it('childCount', () => {
    const t = makeTestTree();
    expect(childCount(t)).toBe(3);
    expect(childCount(childAt(t, 1)!)).toBe(1);
    expect(childCount(childAt(t, 2)!)).toBe(0);
  });
});

describe('Paths', () => {
  it('getPath returns 1-indexed path from root', () => {
    const t = makeTestTree();
    expect(getPath(t)).toEqual([]);
    expect(getPath(childAt(t, 1)!)).toEqual([1]);
    expect(getPath(childAt(t, 2)!)).toEqual([2]);

    const t111 = childAt(childAt(childAt(t, 1)!, 1)!, 1)!;
    expect(getPath(t111)).toEqual([1, 1, 1]);
  });

  it('getByPath navigates correctly', () => {
    const t = makeTestTree();
    expect(getByPath(t, [])).toBe(t);
    expect(getByPath(t, [1])!.surface).toBe('t1');
    expect(getByPath(t, [1, 1, 1])!.surface).toBe('t111');
    expect(getByPath(t, [2])!.surface).toBe('t2');
    expect(getByPath(t, [4])).toBeNull();
  });

  it('pathEqual', () => {
    expect(pathEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(pathEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(pathEqual([], [])).toBe(true);
  });
});

describe('Mutation', () => {
  it('clone creates deep copy', () => {
    const t = makeTestTree();
    const c = clone(t);
    expect(c.parent).toBeNull();
    expect(c.surface).toBe('t');
    expect(childAt(c, 1)!.surface).toBe('t1');
    expect(childAt(c, 1)!.parent).toBe(c);
    // Verify independence
    childAt(c, 1)!.surface = 'modified';
    expect(childAt(t, 1)!.surface).toBe('t1');
  });

  it('detach removes child', () => {
    const t = makeTestTree();
    const t2 = detach(t, 2);
    expect(t2.surface).toBe('t2');
    expect(t2.parent).toBeNull();
    expect(childCount(t)).toBe(2);
    expect(childAt(t, 2)!.surface).toBe('t3');
  });

  it('replaceChild swaps nodes', () => {
    const t = makeTestTree();
    const newN = newStr(null, SYM(99), 'new');
    const old = replaceChild(t, 2, newN);
    expect(old.surface).toBe('t2');
    expect(old.parent).toBeNull();
    expect(childAt(t, 2)!.surface).toBe('new');
    expect(childAt(t, 2)!.parent).toBe(t);
  });

  it('addChild appends and detaches from old parent', () => {
    const t = makeTestTree();
    const other = newRoot(SYM(200));
    const child = newStr(other, SYM(201), 'x');
    expect(childCount(other)).toBe(1);

    addChild(t, child);
    expect(childCount(t)).toBe(4);
    expect(childCount(other)).toBe(0);
    expect(child.parent).toBe(t);
  });

  it('findChild locates by symbol', () => {
    const t = makeTestTree();
    expect(findChild(t, SY2)!.surface).toBe('t2');
    expect(findChild(t, SYM(999))).toBeNull();
  });
});

describe('Walking', () => {
  it('walk visits all nodes depth-first', () => {
    const t = makeTestTree();
    const labels: string[] = [];
    walk(t, n => labels.push(n.surface as string));
    expect(labels).toEqual(['t', 't1', 't11', 't111', 't2', 't3']);
  });

  it('nextInWalk traverses depth-first', () => {
    const t = makeTestTree();
    const labels: string[] = [];
    let n: SemNode | null = t;
    while (n) {
      labels.push(n.surface as string);
      n = nextInWalk(n);
    }
    expect(labels).toEqual(['t', 't1', 't11', 't111', 't2', 't3']);
  });
});

describe('Serialization', () => {
  it('treeToString produces readable output', () => {
    const t = newStr(null, TEST_ROOT, 'hello');
    newInt(t, SY1, 42);
    const s = treeToString(t);
    expect(s).toContain('42');
    expect(s).toContain('"hello"');
  });

  it('treeToJSON produces serializable object', () => {
    const t = newStr(null, TEST_ROOT, 'hi');
    newInt(t, SY1, 7);
    const json = treeToJSON(t);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});
