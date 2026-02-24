import { describe, it, expect } from 'vitest';
import { sid, SemanticType, semeq, NULL_SYMBOL } from '../src/semantic-id.js';
import {
  newRoot, newNode, newInt, newStr, newSym, newEmpty,
  childAt, getParent, root, nextSibling, nodeIndex, childCount,
  getPath, getByPath, pathEqual,
  clone, detach, replaceChild, addChild, findChild,
  detachByPtr, morph, replaceNode, insertAt,
  treeHash, treeSerialize, treeDeserialize,
  treeToString, treeToJSON, treeFromJSON, treeFromString,
  walk, nextInWalk,
  type SemNode, type SemNodeJSON,
} from '../src/tree.js';
import { createBaseSemTable } from '../src/base-defs.js';

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

describe('detachByPtr', () => {
  it('detaches a child by reference', () => {
    const t = makeTestTree();
    const t2 = childAt(t, 2)!;
    detachByPtr(t, t2);
    expect(t2.parent).toBeNull();
    expect(childCount(t)).toBe(2);
    expect(childAt(t, 2)!.surface).toBe('t3');
  });

  it('throws if node is not a child', () => {
    const t = makeTestTree();
    const orphan = newRoot(SYM(999));
    expect(() => detachByPtr(t, orphan)).toThrow('not a child');
  });
});

describe('morph', () => {
  it('changes symbol and surface in-place', () => {
    const t = makeTestTree();
    const t2 = childAt(t, 2)!;
    const src = newInt(null, SYM(99), 42);
    morph(t2, src);
    expect(semeq(t2.symbol, SYM(99))).toBe(true);
    expect(t2.surface).toBe(42);
    // Parent and children preserved
    expect(t2.parent).toBe(t);
  });

  it('preserves children after morph', () => {
    const t = makeTestTree();
    const t1 = childAt(t, 1)!;
    const src = newStr(null, SYM(99), 'morphed');
    morph(t1, src);
    expect(t1.surface).toBe('morphed');
    expect(childCount(t1)).toBe(1); // still has SY11 child
    expect(childAt(t1, 1)!.surface).toBe('t11');
  });
});

describe('replaceNode', () => {
  it('replaces contents in-place keeping position', () => {
    const t = makeTestTree();
    const t2 = childAt(t, 2)!;
    const replacement = newRoot(SYM(99));
    newStr(replacement, SYM(100), 'new child');

    replaceNode(t2, replacement);
    // t2 is still in the tree at position 2
    expect(childAt(t, 2)).toBe(t2);
    expect(t2.parent).toBe(t);
    expect(semeq(t2.symbol, SYM(99))).toBe(true);
    expect(childCount(t2)).toBe(1);
    expect(childAt(t2, 1)!.surface).toBe('new child');
    expect(childAt(t2, 1)!.parent).toBe(t2);
  });

  it('clears replacement to prevent shared references', () => {
    const replacement = newRoot(SYM(99));
    newStr(replacement, SYM(100), 'child');
    const target = newRoot(SYM(1));

    replaceNode(target, replacement);
    expect(replacement.children).toHaveLength(0);
    expect(replacement.parent).toBeNull();
  });
});

describe('insertAt', () => {
  it('inserts at beginning shifting siblings right', () => {
    const t = makeTestTree();
    const newN = newStr(null, SYM(99), 'inserted');
    insertAt(t, [1], newN);
    expect(childCount(t)).toBe(4);
    expect(childAt(t, 1)!.surface).toBe('inserted');
    expect(childAt(t, 2)!.surface).toBe('t1');
    expect(childAt(t, 3)!.surface).toBe('t2');
    expect(childAt(t, 4)!.surface).toBe('t3');
  });

  it('inserts in the middle', () => {
    const t = makeTestTree();
    const newN = newStr(null, SYM(99), 'mid');
    insertAt(t, [2], newN);
    expect(childCount(t)).toBe(4);
    expect(childAt(t, 1)!.surface).toBe('t1');
    expect(childAt(t, 2)!.surface).toBe('mid');
    expect(childAt(t, 3)!.surface).toBe('t2');
  });

  it('appends at end', () => {
    const t = makeTestTree();
    const newN = newStr(null, SYM(99), 'end');
    insertAt(t, [4], newN);
    expect(childCount(t)).toBe(4);
    expect(childAt(t, 4)!.surface).toBe('end');
  });

  it('inserts at nested path', () => {
    const t = makeTestTree();
    const newN = newStr(null, SYM(99), 'deep');
    insertAt(t, [1, 1, 1], newN);
    const t11 = childAt(childAt(t, 1)!, 1)!;
    expect(childCount(t11)).toBe(2);
    expect(childAt(t11, 1)!.surface).toBe('deep');
    expect(childAt(t11, 2)!.surface).toBe('t111');
  });

  it('sets parent reference on inserted node', () => {
    const t = makeTestTree();
    const newN = newStr(null, SYM(99), 'x');
    insertAt(t, [2], newN);
    expect(newN.parent).toBe(t);
  });

  it('throws on empty path', () => {
    const t = makeTestTree();
    expect(() => insertAt(t, [], newRoot(SYM(1)))).toThrow();
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

describe('treeHash', () => {
  it('produces consistent hash for same tree', () => {
    const t1 = makeTestTree();
    const t2 = makeTestTree();
    expect(treeHash(t1)).toBe(treeHash(t2));
  });

  it('produces different hash for different surfaces', () => {
    const t1 = newInt(null, SY1, 42);
    const t2 = newInt(null, SY1, 43);
    expect(treeHash(t1)).not.toBe(treeHash(t2));
  });

  it('produces different hash for different symbols', () => {
    const t1 = newInt(null, SY1, 42);
    const t2 = newInt(null, SY2, 42);
    expect(treeHash(t1)).not.toBe(treeHash(t2));
  });

  it('produces different hash for different children', () => {
    const t1 = newRoot(TEST_ROOT);
    newInt(t1, SY1, 1);
    const t2 = newRoot(TEST_ROOT);
    newInt(t2, SY1, 2);
    expect(treeHash(t1)).not.toBe(treeHash(t2));
  });

  it('hash of clone equals original', () => {
    const t = makeTestTree();
    const c = clone(t);
    expect(treeHash(c)).toBe(treeHash(t));
  });

  it('returns a positive unsigned 32-bit integer', () => {
    const t = makeTestTree();
    const h = treeHash(t);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xFFFFFFFF);
  });
});

describe('Binary serialization', () => {
  it('roundtrips integer surfaces', () => {
    const t = newInt(null, SY1, 42);
    const bin = treeSerialize(t);
    const restored = treeDeserialize(bin);
    expect(restored.surface).toBe(42);
    expect(semeq(restored.symbol, SY1)).toBe(true);
  });

  it('roundtrips string surfaces', () => {
    const t = newStr(null, SY1, 'hello world');
    const restored = treeDeserialize(treeSerialize(t));
    expect(restored.surface).toBe('hello world');
  });

  it('roundtrips null surfaces', () => {
    const t = newRoot(SY1);
    const restored = treeDeserialize(treeSerialize(t));
    expect(restored.surface).toBeNull();
  });

  it('roundtrips boolean surfaces', () => {
    const t = newNode(null, SY1, true);
    const restored = treeDeserialize(treeSerialize(t));
    expect(restored.surface).toBe(true);

    const f = newNode(null, SY1, false);
    const restoredF = treeDeserialize(treeSerialize(f));
    expect(restoredF.surface).toBe(false);
  });

  it('roundtrips Uint8Array surfaces', () => {
    const bytes = new Uint8Array([1, 2, 3, 255, 0]);
    const t = newNode(null, SY1, bytes);
    const restored = treeDeserialize(treeSerialize(t));
    expect(restored.surface).toBeInstanceOf(Uint8Array);
    expect(restored.surface).toEqual(bytes);
  });

  it('roundtrips SemanticID surfaces', () => {
    const t = newSym(null, SY1, SY2);
    const restored = treeDeserialize(treeSerialize(t));
    expect(semeq(restored.surface as any, SY2)).toBe(true);
  });

  it('roundtrips complex tree with children', () => {
    const t = makeTestTree();
    const bin = treeSerialize(t);
    const restored = treeDeserialize(bin);

    expect(restored.surface).toBe('t');
    expect(childCount(restored)).toBe(3);
    expect(childAt(restored, 1)!.surface).toBe('t1');
    expect(childAt(restored, 2)!.surface).toBe('t2');
    expect(childAt(restored, 3)!.surface).toBe('t3');

    const r11 = childAt(childAt(restored, 1)!, 1)!;
    expect(r11.surface).toBe('t11');
    expect(childAt(r11, 1)!.surface).toBe('t111');
  });

  it('preserves parent references', () => {
    const t = makeTestTree();
    const restored = treeDeserialize(treeSerialize(t));
    expect(restored.parent).toBeNull();
    expect(childAt(restored, 1)!.parent).toBe(restored);
    const r11 = childAt(childAt(restored, 1)!, 1)!;
    expect(r11.parent).toBe(childAt(restored, 1));
  });

  it('roundtrips float surfaces correctly', () => {
    const t = newNode(null, SY1, 3.14159);
    const restored = treeDeserialize(treeSerialize(t));
    expect(restored.surface).toBeCloseTo(3.14159);
  });

  it('hash matches after binary roundtrip', () => {
    const t = makeTestTree();
    const restored = treeDeserialize(treeSerialize(t));
    expect(treeHash(restored)).toBe(treeHash(t));
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

describe('treeFromJSON roundtrip', () => {
  it('roundtrips string surfaces', () => {
    const t = newStr(null, TEST_ROOT, 'hello');
    newStr(t, SY1, 'child');
    const json = treeToJSON(t);
    const restored = treeFromJSON(json as SemNodeJSON);
    expect(restored.surface).toBe('hello');
    expect(restored.parent).toBeNull();
    expect(childAt(restored, 1)!.surface).toBe('child');
    expect(childAt(restored, 1)!.parent).toBe(restored);
  });

  it('roundtrips integer surfaces', () => {
    const t = newInt(null, TEST_ROOT, 42);
    const restored = treeFromJSON(treeToJSON(t) as SemNodeJSON);
    expect(restored.surface).toBe(42);
  });

  it('roundtrips boolean surfaces', () => {
    const t = newNode(null, TEST_ROOT, true);
    const restored = treeFromJSON(treeToJSON(t) as SemNodeJSON);
    expect(restored.surface).toBe(true);
  });

  it('roundtrips null surfaces', () => {
    const t = newRoot(TEST_ROOT);
    const restored = treeFromJSON(treeToJSON(t) as SemNodeJSON);
    expect(restored.surface).toBeNull();
  });

  it('roundtrips SemanticID surfaces', () => {
    const t = newSym(null, TEST_ROOT, SY2);
    const json = treeToJSON(t) as SemNodeJSON;
    const restored = treeFromJSON(json);
    expect(semeq(restored.surface as any, SY2)).toBe(true);
  });

  it('roundtrips Uint8Array surfaces', () => {
    const bytes = new Uint8Array([1, 2, 3, 255]);
    const t = newNode(null, TEST_ROOT, bytes);
    const json = treeToJSON(t) as SemNodeJSON;
    // treeToJSON converts Uint8Array to number[]
    expect(json.surface).toEqual([1, 2, 3, 255]);
    const restored = treeFromJSON(json);
    expect(restored.surface).toBeInstanceOf(Uint8Array);
    expect(restored.surface).toEqual(bytes);
  });

  it('roundtrips complex tree with parent references', () => {
    const t = makeTestTree();
    const json = treeToJSON(t) as SemNodeJSON;
    const restored = treeFromJSON(json);

    // Verify structure
    expect(childCount(restored)).toBe(3);
    expect(childAt(restored, 1)!.surface).toBe('t1');
    expect(childAt(restored, 2)!.surface).toBe('t2');
    expect(childAt(restored, 3)!.surface).toBe('t3');

    // Verify nested
    const r11 = childAt(childAt(restored, 1)!, 1)!;
    expect(r11.surface).toBe('t11');
    expect(childAt(r11, 1)!.surface).toBe('t111');

    // Verify parent links
    expect(childAt(restored, 1)!.parent).toBe(restored);
    expect(r11.parent).toBe(childAt(restored, 1));
    expect(childAt(r11, 1)!.parent).toBe(r11);
  });

  it('preserves symbol identity through roundtrip', () => {
    const t = newStr(null, TEST_ROOT, 'x');
    newInt(t, SY1, 1);
    const json = treeToJSON(t) as SemNodeJSON;
    const restored = treeFromJSON(json);
    expect(semeq(restored.symbol, TEST_ROOT)).toBe(true);
    expect(semeq(childAt(restored, 1)!.symbol, SY1)).toBe(true);
  });
});

describe('treeFromString', () => {
  function makeSem() {
    const sem = createBaseSemTable();
    sem.defineSymbol(0, { context: 0, semtype: SemanticType.STRUCTURE, id: 0 }, 'ROOT');
    sem.defineSymbol(0, { context: 0, semtype: SemanticType.STRUCTURE, id: 2 }, 'COUNT');
    sem.defineSymbol(0, { context: 0, semtype: SemanticType.STRUCTURE, id: 5 }, 'NAME');
    sem.defineSymbol(0, { context: 0, semtype: SemanticType.STRUCTURE, id: 0 }, 'CHILD');
    sem.defineSymbol(0, { context: 0, semtype: SemanticType.STRUCTURE, id: 3 }, 'RATE');
    return sem;
  }

  it('parses simple node with no surface', () => {
    const sem = makeSem();
    const t = treeFromString('(ROOT)', sem);
    expect(semeq(t.symbol, sem.symbolByName('ROOT')!)).toBe(true);
    expect(t.surface).toBeNull();
    expect(childCount(t)).toBe(0);
  });

  it('parses node with integer surface', () => {
    const sem = makeSem();
    const t = treeFromString('(COUNT:42)', sem);
    expect(t.surface).toBe(42);
  });

  it('parses node with float surface', () => {
    const sem = makeSem();
    const t = treeFromString('(RATE:3.14)', sem);
    expect(t.surface).toBeCloseTo(3.14);
  });

  it('parses node with string surface', () => {
    const sem = makeSem();
    const t = treeFromString('(NAME:"hello world")', sem);
    expect(t.surface).toBe('hello world');
  });

  it('parses node with children', () => {
    const sem = makeSem();
    const t = treeFromString('(ROOT (CHILD) (CHILD))', sem);
    expect(childCount(t)).toBe(2);
    expect(childAt(t, 1)!.parent).toBe(t);
    expect(childAt(t, 2)!.parent).toBe(t);
  });

  it('parses nested tree', () => {
    const sem = makeSem();
    const t = treeFromString('(ROOT:42 (CHILD (NAME:"deep")))', sem);
    expect(t.surface).toBe(42);
    expect(childCount(t)).toBe(1);
    const child = childAt(t, 1)!;
    expect(childCount(child)).toBe(1);
    expect(childAt(child, 1)!.surface).toBe('deep');
  });

  it('parses negative numbers', () => {
    const sem = makeSem();
    const t = treeFromString('(COUNT:-5)', sem);
    expect(t.surface).toBe(-5);
  });

  it('parses boolean surfaces', () => {
    const sem = makeSem();
    // Use ROOT which has null structure — booleans are valid surface values
    const t = treeFromString('(ROOT:true)', sem);
    expect(t.surface).toBe(true);
    const f = treeFromString('(ROOT:false)', sem);
    expect(f.surface).toBe(false);
  });

  it('parses explicit null surface', () => {
    const sem = makeSem();
    const t = treeFromString('(ROOT:null)', sem);
    expect(t.surface).toBeNull();
  });

  it('throws on unknown symbol', () => {
    const sem = makeSem();
    expect(() => treeFromString('(UNKNOWN:42)', sem)).toThrow('Unknown symbol');
  });

  it('handles whitespace correctly', () => {
    const sem = makeSem();
    const t = treeFromString('  ( ROOT : 42  ( CHILD )  )  ', sem);
    expect(t.surface).toBe(42);
    expect(childCount(t)).toBe(1);
  });
});
