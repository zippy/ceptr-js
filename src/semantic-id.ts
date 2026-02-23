/**
 * SemanticID — the universal identifier for symbols, structures, processes, etc.
 *
 * Ported from ceptr/src/ceptr_types.h
 */

export enum SemanticType {
  STRUCTURE = 1,
  SYMBOL = 2,
  PROCESS = 3,
  RECEPTOR = 4,
  PROTOCOL = 5,
}

export interface SemanticID {
  context: number;
  semtype: SemanticType;
  id: number;
}

export type Symbol = SemanticID;
export type Structure = SemanticID;
export type Process = SemanticID;
export type Protocol = SemanticID;

export function sid(context: number, semtype: SemanticType, id: number): SemanticID {
  return { context, semtype, id };
}

export function semeq(a: SemanticID, b: SemanticID): boolean {
  return a.context === b.context && a.semtype === b.semtype && a.id === b.id;
}

export function isSymbol(s: SemanticID): boolean {
  return s.semtype === SemanticType.SYMBOL;
}

export function isStructure(s: SemanticID): boolean {
  return s.semtype === SemanticType.STRUCTURE;
}

export function isProcess(s: SemanticID): boolean {
  return s.semtype === SemanticType.PROCESS;
}

export const SYS_CONTEXT = 0;

export const NULL_SYMBOL: SemanticID = sid(0, SemanticType.SYMBOL, 0);
export const NULL_STRUCTURE: SemanticID = sid(0, SemanticType.STRUCTURE, 0);
