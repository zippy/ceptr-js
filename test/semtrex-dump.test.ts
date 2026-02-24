import { describe, it, expect } from 'vitest';
import { createBaseSemTable, SYMBOLS } from '../src/base-defs.js';
import { SemTable } from '../src/sem-table.js';
import { NULL_STRUCTURE, semeq, type SemanticID } from '../src/semantic-id.js';
import { parseSemtrex, dumpSemtrex } from '../src/semtrex-parser.js';
import { STRUCTURES } from '../src/base-defs.js';

function makeTestSem(): SemTable {
  const sem = createBaseSemTable();
  const INT = STRUCTURES.INTEGER;
  const FLT = STRUCTURES.FLOAT;
  const STR = STRUCTURES.CSTRING;

  sem.defineSymbol(0, NULL_STRUCTURE, 'PARENT');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child1');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child2');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child3');
  sem.defineSymbol(0, NULL_STRUCTURE, 'HomeLocation');
  sem.defineSymbol(0, FLT, 'lat');
  sem.defineSymbol(0, FLT, 'lon');
  sem.defineSymbol(0, INT, 'MY_INT');
  sem.defineSymbol(0, STR, 'MY_STR');
  sem.defineSymbol(0, NULL_STRUCTURE, 'A');
  sem.defineSymbol(0, NULL_STRUCTURE, 'B');
  sem.defineSymbol(0, NULL_STRUCTURE, 'C');
  sem.defineSymbol(0, NULL_STRUCTURE, 'TASK');
  sem.defineSymbol(0, STR, 'TITLE');
  sem.defineSymbol(0, STR, 'STATUS');
  sem.defineSymbol(0, INT, 'PRIORITY');
  return sem;
}

describe('dumpSemtrex', () => {
  const sem = makeTestSem();

  it('dumps simple symbol literal', () => {
    const tree = parseSemtrex(sem, '/PARENT');
    expect(dumpSemtrex(tree, sem)).toBe('/PARENT');
  });

  it('dumps symbol with children sequence', () => {
    const tree = parseSemtrex(sem, '/PARENT/(child1,child2,child3)');
    expect(dumpSemtrex(tree, sem)).toBe('/PARENT/(child1,child2,child3)');
  });

  it('dumps nested descent', () => {
    const tree = parseSemtrex(sem, '/PARENT/child1');
    expect(dumpSemtrex(tree, sem)).toBe('/PARENT/child1');
  });

  it('dumps value literal (int)', () => {
    const tree = parseSemtrex(sem, '/MY_INT=42');
    expect(dumpSemtrex(tree, sem)).toBe('/MY_INT=42');
  });

  it('dumps value literal (float)', () => {
    const tree = parseSemtrex(sem, '/lat=42.25');
    expect(dumpSemtrex(tree, sem)).toBe('/lat=42.25');
  });

  it('dumps value literal (string)', () => {
    const tree = parseSemtrex(sem, '/MY_STR="hello"');
    expect(dumpSemtrex(tree, sem)).toBe('/MY_STR="hello"');
  });

  it('dumps negated value', () => {
    const tree = parseSemtrex(sem, '/MY_INT!=42');
    expect(dumpSemtrex(tree, sem)).toBe('/MY_INT!=42');
  });

  it('dumps any (.)', () => {
    const tree = parseSemtrex(sem, '/.');
    expect(dumpSemtrex(tree, sem)).toBe('/.');
  });

  it('dumps alternation', () => {
    const tree = parseSemtrex(sem, '/A|B');
    expect(dumpSemtrex(tree, sem)).toBe('/A|B');
  });

  it('dumps negation', () => {
    const tree = parseSemtrex(sem, '/~A');
    expect(dumpSemtrex(tree, sem)).toBe('/~A');
  });

  it('dumps symbol not', () => {
    const tree = parseSemtrex(sem, '/!A');
    expect(dumpSemtrex(tree, sem)).toBe('/!A');
  });

  it('dumps quantifiers', () => {
    expect(dumpSemtrex(parseSemtrex(sem, '/A*'), sem)).toBe('/A*');
    expect(dumpSemtrex(parseSemtrex(sem, '/A+'), sem)).toBe('/A+');
    expect(dumpSemtrex(parseSemtrex(sem, '/A?'), sem)).toBe('/A?');
    expect(dumpSemtrex(parseSemtrex(sem, '/.+'), sem)).toBe('/.+');
    expect(dumpSemtrex(parseSemtrex(sem, '/.*'), sem)).toBe('/.*');
  });

  it('dumps walk', () => {
    const tree = parseSemtrex(sem, '/%A');
    expect(dumpSemtrex(tree, sem)).toBe('/%A');
  });

  it('dumps symbol set', () => {
    const tree = parseSemtrex(sem, '/{A,B,C}');
    expect(dumpSemtrex(tree, sem)).toBe('/{A,B,C}');
  });

  it('dumps negated symbol set', () => {
    const tree = parseSemtrex(sem, '/!{A,B}');
    expect(dumpSemtrex(tree, sem)).toBe('/!{A,B}');
  });

  it('dumps capture group', () => {
    const tree = parseSemtrex(sem, '/<TITLE:TITLE>');
    expect(dumpSemtrex(tree, sem)).toBe('/<TITLE:TITLE>');
  });

  it('dumps complex expression', () => {
    const tree = parseSemtrex(sem, '/TASK/(TITLE,STATUS,.*)');
    expect(dumpSemtrex(tree, sem)).toBe('/TASK/(TITLE,STATUS,.*)');
  });

  it('roundtrips walk with child pattern', () => {
    const tree = parseSemtrex(sem, '/%HomeLocation/(lat,lon)');
    expect(dumpSemtrex(tree, sem)).toBe('/%HomeLocation/(lat,lon)');
  });

  it('roundtrips value set', () => {
    const tree = parseSemtrex(sem, '/MY_INT={1,2,3}');
    expect(dumpSemtrex(tree, sem)).toBe('/MY_INT={1,2,3}');
  });
});
