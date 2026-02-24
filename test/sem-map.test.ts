import { describe, it, expect } from 'vitest';
import { createBaseSemTable, SYMBOLS, STRUCTURES } from '../src/base-defs.js';
import { SemTable } from '../src/sem-table.js';
import { NULL_STRUCTURE, semeq, type SemanticID } from '../src/semantic-id.js';
import { newRoot, newStr, newInt, newNode, newEmpty, childAt, childCount } from '../src/tree.js';
import { parseSemtrex } from '../src/semtrex-parser.js';
import { matchr } from '../src/semtrex-match.js';
import { matchResultsToSemMap } from '../src/semtrex-replace.js';

function makeTestSem(): SemTable {
  const sem = createBaseSemTable();
  sem.defineSymbol(0, NULL_STRUCTURE, 'PARENT');
  sem.defineSymbol(0, NULL_STRUCTURE, 'TASK');
  sem.defineSymbol(0, STRUCTURES.CSTRING, 'TITLE');
  sem.defineSymbol(0, STRUCTURES.CSTRING, 'STATUS');
  sem.defineSymbol(0, STRUCTURES.INTEGER, 'PRIORITY');
  sem.defineSymbol(0, STRUCTURES.FLOAT, 'lat');
  sem.defineSymbol(0, STRUCTURES.FLOAT, 'lon');
  sem.defineSymbol(0, NULL_STRUCTURE, 'HomeLocation');
  return sem;
}

function sym(sem: SemTable, name: string): SemanticID {
  return sem.symbolByName(name)!;
}

describe('matchResultsToSemMap', () => {
  const sem = makeTestSem();

  it('creates semantic map from single capture group', () => {
    const tree = newRoot(sym(sem, 'PARENT'));
    newStr(tree, sym(sem, 'TITLE'), 'My Task');

    const stx = parseSemtrex(sem, '/PARENT/<TITLE:TITLE>');
    const results = matchr(stx, tree);
    expect(results).not.toBeNull();

    const semMap = matchResultsToSemMap(results!, tree);
    expect(semeq(semMap.symbol, SYMBOLS.SEMANTIC_MAP)).toBe(true);
    expect(childCount(semMap)).toBe(1);

    // Check SEMANTIC_LINK structure
    const link = childAt(semMap, 1)!;
    expect(semeq(link.symbol, SYMBOLS.SEMANTIC_LINK)).toBe(true);
    expect(childCount(link)).toBe(2);

    // USAGE should have the group symbol
    const usage = childAt(link, 1)!;
    expect(semeq(usage.symbol, SYMBOLS.USAGE)).toBe(true);
    expect(semeq(usage.surface as SemanticID, sym(sem, 'TITLE'))).toBe(true);

    // REPLACEMENT_VALUE should contain the matched value
    const repVal = childAt(link, 2)!;
    expect(semeq(repVal.symbol, SYMBOLS.REPLACEMENT_VALUE)).toBe(true);
    expect(childCount(repVal)).toBe(1);
    const valNode = childAt(repVal, 1)!;
    expect(valNode.surface).toBe('My Task');
  });

  it('creates semantic map from multiple capture groups', () => {
    const tree = newRoot(sym(sem, 'HomeLocation'));
    newNode(tree, sym(sem, 'lat'), 42.25);
    newNode(tree, sym(sem, 'lon'), 73.25);

    const stx = parseSemtrex(sem, '/HomeLocation/(<lat:lat>,<lon:lon>)');
    const results = matchr(stx, tree);
    expect(results).not.toBeNull();

    const semMap = matchResultsToSemMap(results!, tree);
    expect(semeq(semMap.symbol, SYMBOLS.SEMANTIC_MAP)).toBe(true);
    expect(childCount(semMap)).toBe(2);

    // First link: lat
    const link1 = childAt(semMap, 1)!;
    const usage1 = childAt(link1, 1)!;
    expect(semeq(usage1.surface as SemanticID, sym(sem, 'lat'))).toBe(true);
    const repVal1 = childAt(link1, 2)!;
    expect(childAt(repVal1, 1)!.surface).toBe(42.25);

    // Second link: lon
    const link2 = childAt(semMap, 2)!;
    const usage2 = childAt(link2, 1)!;
    expect(semeq(usage2.surface as SemanticID, sym(sem, 'lon'))).toBe(true);
    const repVal2 = childAt(link2, 2)!;
    expect(childAt(repVal2, 1)!.surface).toBe(73.25);
  });

  it('handles task with multiple fields', () => {
    const tree = newRoot(sym(sem, 'TASK'));
    newStr(tree, sym(sem, 'TITLE'), 'Build semtrex');
    newStr(tree, sym(sem, 'STATUS'), 'in-progress');
    newInt(tree, sym(sem, 'PRIORITY'), 1);

    const stx = parseSemtrex(sem, '/TASK/(<TITLE:TITLE>,<STATUS:STATUS>,.*)');
    const results = matchr(stx, tree);
    expect(results).not.toBeNull();

    const semMap = matchResultsToSemMap(results!, tree);
    expect(childCount(semMap)).toBe(2);

    // Verify TITLE link
    const titleLink = childAt(semMap, 1)!;
    const titleUsage = childAt(titleLink, 1)!;
    expect(semeq(titleUsage.surface as SemanticID, sym(sem, 'TITLE'))).toBe(true);
    const titleVal = childAt(childAt(titleLink, 2)!, 1)!;
    expect(titleVal.surface).toBe('Build semtrex');

    // Verify STATUS link
    const statusLink = childAt(semMap, 2)!;
    const statusUsage = childAt(statusLink, 1)!;
    expect(semeq(statusUsage.surface as SemanticID, sym(sem, 'STATUS'))).toBe(true);
  });

  it('creates empty map for no captures', () => {
    const semMap = matchResultsToSemMap([], newRoot(sym(sem, 'PARENT')));
    expect(semeq(semMap.symbol, SYMBOLS.SEMANTIC_MAP)).toBe(true);
    expect(childCount(semMap)).toBe(0);
  });
});
