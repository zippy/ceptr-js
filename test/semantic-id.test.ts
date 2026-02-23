import { describe, it, expect } from 'vitest';
import {
  sid, semeq, SemanticType, isSymbol, isStructure, isProcess,
  NULL_SYMBOL, NULL_STRUCTURE, SYS_CONTEXT,
} from '../src/semantic-id.js';

describe('SemanticID', () => {
  it('creates SemanticIDs with sid()', () => {
    const s = sid(0, SemanticType.SYMBOL, 5);
    expect(s.context).toBe(0);
    expect(s.semtype).toBe(SemanticType.SYMBOL);
    expect(s.id).toBe(5);
  });

  it('semeq compares all three fields', () => {
    const a = sid(0, SemanticType.SYMBOL, 1);
    const b = sid(0, SemanticType.SYMBOL, 1);
    const c = sid(0, SemanticType.SYMBOL, 2);
    const d = sid(1, SemanticType.SYMBOL, 1);
    const e = sid(0, SemanticType.STRUCTURE, 1);

    expect(semeq(a, b)).toBe(true);
    expect(semeq(a, c)).toBe(false);
    expect(semeq(a, d)).toBe(false);
    expect(semeq(a, e)).toBe(false);
  });

  it('type predicates work', () => {
    expect(isSymbol(sid(0, SemanticType.SYMBOL, 1))).toBe(true);
    expect(isSymbol(sid(0, SemanticType.STRUCTURE, 1))).toBe(false);
    expect(isStructure(sid(0, SemanticType.STRUCTURE, 1))).toBe(true);
    expect(isProcess(sid(0, SemanticType.PROCESS, 1))).toBe(true);
  });

  it('NULL_SYMBOL and NULL_STRUCTURE are distinct', () => {
    expect(semeq(NULL_SYMBOL, NULL_STRUCTURE)).toBe(false);
    expect(NULL_SYMBOL.context).toBe(SYS_CONTEXT);
    expect(NULL_STRUCTURE.context).toBe(SYS_CONTEXT);
  });
});
