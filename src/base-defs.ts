/**
 * Built-in system symbols and structures.
 *
 * Ported from ceptr/src/base_defs.h — only the essential subset needed
 * for semantic trees and semtrex.
 */

import { type SemanticID, SemanticType, sid, SYS_CONTEXT, NULL_SYMBOL, NULL_STRUCTURE } from './semantic-id.js';
import { SemTable } from './sem-table.js';

// --- System Structures (defined by ID for stable references) ---

export const STRUCTURES = {
  NULL_STRUCTURE,
  BIT:       sid(SYS_CONTEXT, SemanticType.STRUCTURE, 1),
  INTEGER:   sid(SYS_CONTEXT, SemanticType.STRUCTURE, 2),
  FLOAT:     sid(SYS_CONTEXT, SemanticType.STRUCTURE, 3),
  CHAR:      sid(SYS_CONTEXT, SemanticType.STRUCTURE, 4),
  CSTRING:   sid(SYS_CONTEXT, SemanticType.STRUCTURE, 5),
  SYMBOL:    sid(SYS_CONTEXT, SemanticType.STRUCTURE, 6),
  BLOB:      sid(SYS_CONTEXT, SemanticType.STRUCTURE, 7),
  INTEGER64: sid(SYS_CONTEXT, SemanticType.STRUCTURE, 8),
  TREE:      sid(SYS_CONTEXT, SemanticType.STRUCTURE, 9),
  TREE_PATH: sid(SYS_CONTEXT, SemanticType.STRUCTURE, 10),
} as const;

// --- System Symbols ---
// We assign stable IDs directly rather than using auto-increment,
// so they can be referenced as constants across modules.

let _nextSysSymId = 1;
function sysSymbol(id: number): SemanticID {
  return sid(SYS_CONTEXT, SemanticType.SYMBOL, id);
}

// General system symbols
export const SYMBOLS = {
  NULL_SYMBOL,
  DEFINITIONS:   sysSymbol(1),
  STRUCTURES_SYM: sysSymbol(2),
  SYMBOLS_SYM:   sysSymbol(3),
  ASCII_CHARS:   sysSymbol(4),
  ASCII_CHAR:    sysSymbol(5),
  // Semtrex symbols
  SEMTREX_SYMBOL_LITERAL:     sysSymbol(20),
  SEMTREX_SYMBOL_LITERAL_NOT: sysSymbol(21),
  SEMTREX_SYMBOL:             sysSymbol(22),
  SEMTREX_SYMBOL_SET:         sysSymbol(23),
  SEMTREX_SYMBOL_ANY:         sysSymbol(24),
  SEMTREX_SEQUENCE:           sysSymbol(25),
  SEMTREX_OR:                 sysSymbol(26),
  SEMTREX_NOT:                sysSymbol(27),
  SEMTREX_ZERO_OR_MORE:       sysSymbol(28),
  SEMTREX_ONE_OR_MORE:        sysSymbol(29),
  SEMTREX_ZERO_OR_ONE:        sysSymbol(30),
  SEMTREX_VALUE_LITERAL:      sysSymbol(31),
  SEMTREX_VALUE_LITERAL_NOT:  sysSymbol(32),
  SEMTREX_VALUE_SET:          sysSymbol(33),
  SEMTREX_GROUP:              sysSymbol(34),
  SEMTREX_DESCEND:            sysSymbol(35),
  SEMTREX_WALK:               sysSymbol(36),
  // Match result symbols
  SEMTREX_MATCH:              sysSymbol(40),
  SEMTREX_MATCH_SYMBOL:       sysSymbol(41),
  SEMTREX_MATCH_PATH:         sysSymbol(42),
  SEMTREX_MATCH_SIBLINGS_COUNT: sysSymbol(43),
} as const;

/**
 * Register all base definitions into a SemTable.
 * This mutates the table's SYS_CONTEXT stores to use our fixed IDs.
 * Returns the table for chaining.
 */
export function registerBaseDefs(sem: SemTable): SemTable {
  // Register structures with their well-known names
  // We bypass defineStructure to set specific IDs, so we register them manually
  const structDefs: Array<[SemanticID, string, SemanticID[]]> = [
    [STRUCTURES.BIT,       'BIT',       []],
    [STRUCTURES.INTEGER,   'INTEGER',   []],
    [STRUCTURES.FLOAT,     'FLOAT',     []],
    [STRUCTURES.CHAR,      'CHAR',      []],
    [STRUCTURES.CSTRING,   'CSTRING',   []],
    [STRUCTURES.SYMBOL,    'SYMBOL',    []],
    [STRUCTURES.BLOB,      'BLOB',      []],
    [STRUCTURES.INTEGER64, 'INTEGER64', []],
    [STRUCTURES.TREE,      'TREE',      []],
    [STRUCTURES.TREE_PATH, 'TREE_PATH', []],
  ];
  for (const [sid, label, parts] of structDefs) {
    // Use the internal method path — we're bootstrapping
    (sem as any).ensureContext(sid.context);
    const store = (sem as any).contexts.get(sid.context)!;
    store.structures.set(sid.id, { label, parts });
    if (sid.id >= store.nextStructureId) {
      store.nextStructureId = sid.id + 1;
    }
  }

  // Register symbols
  const symDefs: Array<[SemanticID, string, SemanticID]> = [
    [SYMBOLS.DEFINITIONS,   'DEFINITIONS',   STRUCTURES.NULL_STRUCTURE],
    [SYMBOLS.STRUCTURES_SYM, 'STRUCTURES',   STRUCTURES.NULL_STRUCTURE],
    [SYMBOLS.SYMBOLS_SYM,   'SYMBOLS',       STRUCTURES.NULL_STRUCTURE],
    [SYMBOLS.ASCII_CHARS,   'ASCII_CHARS',    STRUCTURES.CSTRING],
    [SYMBOLS.ASCII_CHAR,    'ASCII_CHAR',     STRUCTURES.CHAR],
    // Semtrex
    [SYMBOLS.SEMTREX_SYMBOL_LITERAL,     'SEMTREX_SYMBOL_LITERAL',     STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_SYMBOL_LITERAL_NOT, 'SEMTREX_SYMBOL_LITERAL_NOT', STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_SYMBOL,             'SEMTREX_SYMBOL',             STRUCTURES.SYMBOL],
    [SYMBOLS.SEMTREX_SYMBOL_SET,         'SEMTREX_SYMBOL_SET',         STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_SYMBOL_ANY,         'SEMTREX_SYMBOL_ANY',         STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_SEQUENCE,           'SEMTREX_SEQUENCE',           STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_OR,                 'SEMTREX_OR',                 STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_NOT,                'SEMTREX_NOT',                STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_ZERO_OR_MORE,       'SEMTREX_ZERO_OR_MORE',       STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_ONE_OR_MORE,        'SEMTREX_ONE_OR_MORE',        STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_ZERO_OR_ONE,        'SEMTREX_ZERO_OR_ONE',        STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_VALUE_LITERAL,      'SEMTREX_VALUE_LITERAL',      STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_VALUE_LITERAL_NOT,  'SEMTREX_VALUE_LITERAL_NOT',  STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_VALUE_SET,          'SEMTREX_VALUE_SET',          STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_GROUP,              'SEMTREX_GROUP',              STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_DESCEND,            'SEMTREX_DESCEND',            STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_WALK,               'SEMTREX_WALK',               STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_MATCH,              'SEMTREX_MATCH',              STRUCTURES.TREE],
    [SYMBOLS.SEMTREX_MATCH_SYMBOL,       'SEMTREX_MATCH_SYMBOL',       STRUCTURES.SYMBOL],
    [SYMBOLS.SEMTREX_MATCH_PATH,         'SEMTREX_MATCH_PATH',         STRUCTURES.TREE_PATH],
    [SYMBOLS.SEMTREX_MATCH_SIBLINGS_COUNT, 'SEMTREX_MATCH_SIBLINGS_COUNT', STRUCTURES.INTEGER],
  ];
  for (const [symId, label, structId] of symDefs) {
    (sem as any).ensureContext(symId.context);
    const store = (sem as any).contexts.get(symId.context)!;
    store.symbols.set(symId.id, { label, structure: structId });
    if (symId.id >= store.nextSymbolId) {
      store.nextSymbolId = symId.id + 1;
    }
  }

  return sem;
}

/** Create a new SemTable pre-loaded with base definitions. */
export function createBaseSemTable(): SemTable {
  return registerBaseDefs(new SemTable());
}
