/**
 * ceptr-js — Semantic trees and Semtrex pattern matching in TypeScript.
 *
 * Public API surface.
 */

// --- Core types ---
export {
  type SemanticID, type Symbol, type Structure, type Process, type Protocol,
  SemanticType, sid, semeq,
  isSymbol, isStructure, isProcess,
  SYS_CONTEXT, NULL_SYMBOL, NULL_STRUCTURE,
} from './semantic-id.js';

// --- Semantic tree ---
export {
  type SemNode, type Surface, type SemTableLike,
  newNode, newInt, newStr, newSym, newRoot, newEmpty,
  childAt, getParent, root, nextSibling, nodeIndex, childCount,
  getPath, getByPath, pathEqual,
  clone, detach, replaceChild, addChild, findChild,
  treeToString, treeToJSON,
  walk, nextInWalk,
} from './tree.js';

// --- Definition registry ---
export { SemTable, type SymbolDef, type StructureDef } from './sem-table.js';
export { SYMBOLS, STRUCTURES, registerBaseDefs, createBaseSemTable } from './base-defs.js';

// --- Semtrex types ---
export { StateType, type SState } from './semtrex-types.js';

// --- Semtrex parser ---
export { parseSemtrex, tokenize, SemtrexParseError, type Token, TokenType } from './semtrex-parser.js';

// --- Semtrex FSA ---
export { makeFA } from './semtrex-fsa.js';

// --- Semtrex matcher ---
export {
  match, matchr,
  type MatchResult,
  getMatchBySymbol, getMatchedNodes,
} from './semtrex-match.js';

// --- Semtrex replace ---
export { embodyFromMatch, stxReplace } from './semtrex-replace.js';
