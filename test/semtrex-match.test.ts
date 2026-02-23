import { describe, it, expect } from 'vitest';
import { createBaseSemTable } from '../src/base-defs.js';
import { SemTable } from '../src/sem-table.js';
import { SemanticType, NULL_STRUCTURE, semeq, type SemanticID } from '../src/semantic-id.js';
import { newRoot, newStr, newInt, newNode, newEmpty, childAt, type SemNode } from '../src/tree.js';
import { parseSemtrex } from '../src/semtrex-parser.js';
import { match, matchr, getMatchBySymbol, getMatchedNodes } from '../src/semtrex-match.js';
import { embodyFromMatch } from '../src/semtrex-replace.js';
import { STRUCTURES } from '../src/base-defs.js';

function makeTestSem(): SemTable {
  const sem = createBaseSemTable();
  const INT = STRUCTURES.INTEGER;
  const FLT = STRUCTURES.FLOAT;
  const STR = STRUCTURES.CSTRING;
  const CHR = STRUCTURES.CHAR;

  sem.defineSymbol(0, NULL_STRUCTURE, 'TEST_ROOT');
  sem.defineSymbol(0, NULL_STRUCTURE, 'PARENT');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child1');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child2');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child3');
  sem.defineSymbol(0, NULL_STRUCTURE, 'grandchild');
  sem.defineSymbol(0, NULL_STRUCTURE, 'HomeLocation');
  sem.defineSymbol(0, FLT, 'lat');
  sem.defineSymbol(0, FLT, 'lon');
  sem.defineSymbol(0, INT, 'MY_INT');
  sem.defineSymbol(0, STR, 'MY_STR');
  sem.defineSymbol(0, CHR, 'MY_CHAR');
  sem.defineSymbol(0, NULL_STRUCTURE, 'A');
  sem.defineSymbol(0, NULL_STRUCTURE, 'B');
  sem.defineSymbol(0, NULL_STRUCTURE, 'C');
  sem.defineSymbol(0, NULL_STRUCTURE, 'TASK');
  sem.defineSymbol(0, STR, 'TITLE');
  sem.defineSymbol(0, STR, 'STATUS');
  sem.defineSymbol(0, INT, 'PRIORITY');
  sem.defineSymbol(0, NULL_STRUCTURE, 'DEEP');
  sem.defineSymbol(0, NULL_STRUCTURE, 'DEEPER');
  return sem;
}

function sym(sem: SemTable, name: string): SemanticID {
  return sem.symbolByName(name)!;
}

describe('Semtrex matching', () => {
  const sem = makeTestSem();

  it('matches simple symbol', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    const stx = parseSemtrex(sem, '/PARENT');
    expect(match(stx, tree)).toBe(true);
  });

  it('rejects wrong symbol', () => {
    const tree = newRoot(sym(sem, 'A'));
    const stx = parseSemtrex(sem, '/B');
    expect(match(stx, tree)).toBe(false);
  });

  it('matches symbol with children sequence', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    newEmpty(tree, sym(sem, 'child1'));
    newEmpty(tree, sym(sem, 'child2'));
    newEmpty(tree, sym(sem, 'child3'));

    expect(match(parseSemtrex(sem, '/PARENT/(child1,child2,child3)'), tree)).toBe(true);
    expect(match(parseSemtrex(sem, '/PARENT/(child1,child3)'), tree)).toBe(false);
    // Semtrex sequences are prefix-matching (like regex): (child1,child2) matches
    // the first two children even if there are more.
    expect(match(parseSemtrex(sem, '/PARENT/(child1,child2)'), tree)).toBe(true);
  });

  it('matches nested descent', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    const c1 = newEmpty(tree, sym(sem, 'child1'));
    newEmpty(c1, sym(sem, 'grandchild'));
    newEmpty(tree, sym(sem, 'child2'));

    expect(match(parseSemtrex(sem, '/PARENT/(child1/grandchild,child2)'), tree)).toBe(true);
  });

  it('matches value literal (int)', () => {
    const tree = newInt(null, sym(sem, 'MY_INT'), 42);
    expect(match(parseSemtrex(sem, '/MY_INT=42'), tree)).toBe(true);
    expect(match(parseSemtrex(sem, '/MY_INT=99'), tree)).toBe(false);
  });

  it('matches value literal (float)', () => {
    const tree = newNode(null, sym(sem, 'lat'), 42.25);
    expect(match(parseSemtrex(sem, '/lat=42.25'), tree)).toBe(true);
    expect(match(parseSemtrex(sem, '/lat=99.0'), tree)).toBe(false);
  });

  it('matches value literal (string)', () => {
    const tree = newStr(null, sym(sem, 'MY_STR'), 'hello');
    expect(match(parseSemtrex(sem, '/MY_STR="hello"'), tree)).toBe(true);
    expect(match(parseSemtrex(sem, '/MY_STR="world"'), tree)).toBe(false);
  });

  it('matches negated value', () => {
    const tree = newInt(null, sym(sem, 'MY_INT'), 42);
    expect(match(parseSemtrex(sem, '/MY_INT!=99'), tree)).toBe(true);
    expect(match(parseSemtrex(sem, '/MY_INT!=42'), tree)).toBe(false);
  });

  it('matches any symbol (.)', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    newEmpty(tree, sym(sem, 'child1'));

    // "." matches any single node as child
    expect(match(parseSemtrex(sem, '/PARENT/.'), tree)).toBe(true);
  });

  it('matches one-or-more (.+)', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    newEmpty(tree, sym(sem, 'A'));
    newEmpty(tree, sym(sem, 'B'));
    newEmpty(tree, sym(sem, 'C'));

    expect(match(parseSemtrex(sem, '/PARENT/.+'), tree)).toBe(true);

    // Empty children should NOT match .+
    const empty = newRoot(sym(sem, 'PARENT'));
    expect(match(parseSemtrex(sem, '/PARENT/.+'), empty)).toBe(false);
  });

  it('matches zero-or-more (.*)', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    // No children — .* should still match
    expect(match(parseSemtrex(sem, '/PARENT/.*'), tree)).toBe(true);

    // With children
    newEmpty(tree, sym(sem, 'A'));
    expect(match(parseSemtrex(sem, '/PARENT/.*'), tree)).toBe(true);
  });

  it('matches alternation (|)', () => {
    const treeA = newRoot(sym(sem, 'A'));
    const treeB = newRoot(sym(sem, 'B'));
    const treeC = newRoot(sym(sem, 'C'));

    const stx = parseSemtrex(sem, '/A|B');
    expect(match(stx, treeA)).toBe(true);
    expect(match(stx, treeB)).toBe(true);
    expect(match(stx, treeC)).toBe(false);
  });

  it('matches negation (~)', () => {
    const treeA = newRoot(sym(sem, 'A'));
    const treeB = newRoot(sym(sem, 'B'));

    const stx = parseSemtrex(sem, '/~A');
    expect(match(stx, treeA)).toBe(false);
    expect(match(stx, treeB)).toBe(true);
  });

  it('matches symbol not (!)', () => {
    const treeA = newRoot(sym(sem, 'A'));
    const treeB = newRoot(sym(sem, 'B'));

    const stx = parseSemtrex(sem, '/!A');
    expect(match(stx, treeA)).toBe(false);
    expect(match(stx, treeB)).toBe(true);
  });

  it('matches symbol set', () => {
    const treeA = newRoot(sym(sem, 'A'));
    const treeB = newRoot(sym(sem, 'B'));
    const treeC = newRoot(sym(sem, 'C'));

    const stx = parseSemtrex(sem, '/{A,B}');
    expect(match(stx, treeA)).toBe(true);
    expect(match(stx, treeB)).toBe(true);
    expect(match(stx, treeC)).toBe(false);
  });

  it('matches negated symbol set', () => {
    const treeA = newRoot(sym(sem, 'A'));
    const treeC = newRoot(sym(sem, 'C'));

    const stx = parseSemtrex(sem, '/!{A,B}');
    expect(match(stx, treeA)).toBe(false);
    expect(match(stx, treeC)).toBe(true);
  });

  it('matches walk (%) — find deep node', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    const c1 = newEmpty(tree, sym(sem, 'child1'));
    const deep = newEmpty(c1, sym(sem, 'DEEP'));
    newEmpty(deep, sym(sem, 'DEEPER'));

    expect(match(parseSemtrex(sem, '/%DEEP'), tree)).toBe(true);
    expect(match(parseSemtrex(sem, '/%DEEPER'), tree)).toBe(true);
    expect(match(parseSemtrex(sem, '/%MY_INT'), tree)).toBe(false);
  });

  it('matches walk with child pattern', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    const c1 = newEmpty(tree, sym(sem, 'child1'));
    const deep = newEmpty(c1, sym(sem, 'DEEP'));
    newEmpty(deep, sym(sem, 'DEEPER'));

    expect(match(parseSemtrex(sem, '/%DEEP/DEEPER'), tree)).toBe(true);
    expect(match(parseSemtrex(sem, '/%DEEP/A'), tree)).toBe(false);
  });
});

describe('Semtrex capture groups', () => {
  const sem = makeTestSem();

  it('captures a group', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    newStr(tree, sym(sem, 'TITLE'), 'My Task');

    const stx = parseSemtrex(sem, '/PARENT/<TITLE:TITLE>');
    const results = matchr(stx, tree);
    expect(results).not.toBeNull();
    expect(results!.length).toBe(1);
    expect(semeq(results![0].symbol, sym(sem, 'TITLE'))).toBe(true);
  });

  it('captures nested groups', () => {
    const tree = newRoot(sym(sem, 'HomeLocation'));
    newNode(tree, sym(sem, 'lat'), 42.25);
    newNode(tree, sym(sem, 'lon'), 73.25);

    const stx = parseSemtrex(sem, '/HomeLocation/(<lat:lat>,<lon:lon>)');
    const results = matchr(stx, tree);
    expect(results).not.toBeNull();
    expect(results!.length).toBe(2);

    const latMatch = getMatchBySymbol(results!, sym(sem, 'lat'));
    expect(latMatch).toBeDefined();

    const lonMatch = getMatchBySymbol(results!, sym(sem, 'lon'));
    expect(lonMatch).toBeDefined();
  });

  it('getMatchedNodes extracts the right nodes', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    const title = newStr(tree, sym(sem, 'TITLE'), 'hello');
    newStr(tree, sym(sem, 'STATUS'), 'open');

    const stx = parseSemtrex(sem, '/PARENT/<TITLE:TITLE>');
    const results = matchr(stx, tree);
    expect(results).not.toBeNull();

    const nodes = getMatchedNodes(tree, results![0]);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(nodes[0].surface).toBe('hello');
  });
});

describe('Semtrex embody', () => {
  const sem = makeTestSem();

  it('embodies a simple capture', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    newStr(tree, sym(sem, 'TITLE'), 'My Task');
    newStr(tree, sym(sem, 'STATUS'), 'open');

    const stx = parseSemtrex(sem, '/PARENT/<TITLE:TITLE>');
    const results = matchr(stx, tree);
    expect(results).not.toBeNull();

    const embodied = embodyFromMatch(results!, tree);
    expect(embodied).not.toBeNull();
    expect(semeq(embodied!.symbol, sym(sem, 'TITLE'))).toBe(true);
    expect(embodied!.surface).toBe('My Task');
  });

  it('embodies nested captures', () => {
    const tree = newRoot(sym(sem, 'HomeLocation'));
    newNode(tree, sym(sem, 'lat'), 42.25);
    newNode(tree, sym(sem, 'lon'), 73.25);

    // Match HomeLocation root, descend to children, capture lat and lon
    const stx = parseSemtrex(sem, '/HomeLocation/(<lat:lat>,<lon:lon>)');
    const results = matchr(stx, tree);
    expect(results).not.toBeNull();
    expect(results!.length).toBe(2);

    const embodied = embodyFromMatch(results!, tree);
    expect(embodied).not.toBeNull();
    // First top-level group becomes the root of embodied tree
    expect(semeq(embodied!.symbol, sym(sem, 'lat'))).toBe(true);
  });
});

describe('Real-world-ish scenarios', () => {
  const sem = makeTestSem();

  it('matches a task with TITLE and STATUS children', () => {
    const task = newRoot(sym(sem, 'TASK'));
    newStr(task, sym(sem, 'TITLE'), 'Build semtrex');
    newStr(task, sym(sem, 'STATUS'), 'in-progress');
    newInt(task, sym(sem, 'PRIORITY'), 1);

    // A tool declaring it needs TASK with TITLE and STATUS
    expect(match(parseSemtrex(sem, '/TASK/(TITLE,STATUS,.*)'), task)).toBe(true);

    // A different tool wanting TITLE and PRIORITY
    expect(match(parseSemtrex(sem, '/TASK/(TITLE,.,PRIORITY)'), task)).toBe(true);
  });

  it('walk finds TITLE anywhere in tree', () => {
    const root = newRoot(sym(sem, 'PARENT'));
    const task = newEmpty(root, sym(sem, 'TASK'));
    newStr(task, sym(sem, 'TITLE'), 'Found it');
    newStr(task, sym(sem, 'STATUS'), 'done');

    expect(match(parseSemtrex(sem, '/%TITLE'), root)).toBe(true);
    expect(match(parseSemtrex(sem, '/%TITLE="Found it"'), root)).toBe(true);
    expect(match(parseSemtrex(sem, '/%TITLE="wrong"'), root)).toBe(false);
  });
});
