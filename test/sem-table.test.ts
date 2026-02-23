import { describe, it, expect } from 'vitest';
import { SemTable } from '../src/sem-table.js';
import { SemanticType, semeq, SYS_CONTEXT, NULL_STRUCTURE } from '../src/semantic-id.js';
import { createBaseSemTable, SYMBOLS, STRUCTURES } from '../src/base-defs.js';

describe('SemTable', () => {
  it('defines and retrieves symbols', () => {
    const sem = new SemTable();
    const intStruct = sem.defineStructure(0, 'INTEGER');
    const mySym = sem.defineSymbol(0, intStruct, 'MY_SYMBOL');

    expect(mySym.context).toBe(0);
    expect(mySym.semtype).toBe(SemanticType.SYMBOL);

    const def = sem.getSymbolDef(mySym);
    expect(def).toBeDefined();
    expect(def!.label).toBe('MY_SYMBOL');
    expect(semeq(def!.structure, intStruct)).toBe(true);
  });

  it('defines structures with parts', () => {
    const sem = new SemTable();
    const lat = sem.defineSymbol(0, NULL_STRUCTURE, 'lat');
    const lon = sem.defineSymbol(0, NULL_STRUCTURE, 'lon');
    const latlon = sem.defineStructure(0, 'LATLON', lat, lon);

    const def = sem.getStructureDef(latlon);
    expect(def).toBeDefined();
    expect(def!.label).toBe('LATLON');
    expect(def!.parts).toHaveLength(2);
    expect(semeq(def!.parts[0], lat)).toBe(true);
    expect(semeq(def!.parts[1], lon)).toBe(true);
  });

  it('resolves symbols by name', () => {
    const sem = new SemTable();
    const s = sem.defineSymbol(0, NULL_STRUCTURE, 'HELLO');
    const found = sem.symbolByName('HELLO');
    expect(found).toBeDefined();
    expect(semeq(found!, s)).toBe(true);
    expect(sem.symbolByName('NOPE')).toBeUndefined();
  });

  it('resolves structures by name', () => {
    const sem = new SemTable();
    const st = sem.defineStructure(0, 'MY_STRUCT');
    const found = sem.structureByName('MY_STRUCT');
    expect(found).toBeDefined();
    expect(semeq(found!, st)).toBe(true);
  });

  it('supports multiple contexts', () => {
    const sem = new SemTable();
    const s0 = sem.defineSymbol(0, NULL_STRUCTURE, 'SHARED_NAME');
    const s1 = sem.defineSymbol(1, NULL_STRUCTURE, 'SHARED_NAME');
    expect(semeq(s0, s1)).toBe(false);
    expect(s0.context).toBe(0);
    expect(s1.context).toBe(1);
  });
});

describe('Base definitions', () => {
  it('creates a SemTable with system definitions', () => {
    const sem = createBaseSemTable();
    expect(sem.getSymbolLabel(SYMBOLS.ASCII_CHARS)).toBe('ASCII_CHARS');
    expect(sem.getSymbolLabel(SYMBOLS.SEMTREX_SYMBOL_LITERAL)).toBe('SEMTREX_SYMBOL_LITERAL');
    expect(sem.getStructureLabel(STRUCTURES.INTEGER)).toBe('INTEGER');
    expect(sem.getStructureLabel(STRUCTURES.CSTRING)).toBe('CSTRING');
  });

  it('can resolve semtrex symbols by name', () => {
    const sem = createBaseSemTable();
    const found = sem.symbolByName('SEMTREX_WALK');
    expect(found).toBeDefined();
    expect(semeq(found!, SYMBOLS.SEMTREX_WALK)).toBe(true);
  });

  it('user symbols get IDs after system symbols', () => {
    const sem = createBaseSemTable();
    const userSym = sem.defineSymbol(SYS_CONTEXT, NULL_STRUCTURE, 'MY_THING');
    // Should not collide with any system symbol
    expect(userSym.id).toBeGreaterThan(43);
  });
});
