/**
 * Semtrex-specific types and constants.
 *
 * Semtrex trees are regular SemNode trees whose symbols are the SEMTREX_*
 * symbols from base-defs. This file provides the FSA state types used
 * by the NFA construction and matcher.
 */

import { type SemanticID } from './semantic-id.js';
import { type SemNode } from './tree.js';

// --- FSA State types (from semtrex.h) ---

export enum StateType {
  Symbol = 0,
  Any = 1,
  Value = 2,
  Split = 3,
  Match = 4,
  GroupOpen = 5,
  GroupClose = 6,
  Descend = 7,
  Walk = 8,
  Not = 9,
}

/**
 * Transition types for FSA state machine.
 * TransitionDown = 1: move to first child
 * TransitionNone = 0: stay at same level (next sibling)
 * Negative values: pop up abs(value) levels then advance to next sibling
 */
export const TransitionDown = 1;
export const TransitionNone = 0;

export function isTransitionPop(t: number): boolean {
  return t < 0;
}

export function isTransitionNext(t: number): boolean {
  return t === 0;
}

// --- Literal match flags ---

export const LITERAL_NOT = 0x01;
export const LITERAL_SET = 0x02;

// --- FSA State ---

export interface SymbolData {
  flags: number;
  symbols: SemNode; // cloned subtree holding SEMTREX_SYMBOL or SEMTREX_SYMBOL_SET
}

export interface ValueData {
  flags: number;
  values: SemNode; // cloned subtree holding value nodes or SEMTREX_VALUE_SET
}

export interface GroupOpenData {
  symbol: SemanticID;
  uid: number;
}

export interface GroupCloseData {
  openState: SState;
}

export type StateData =
  | { kind: 'symbol'; symbol: SymbolData }
  | { kind: 'value'; value: ValueData }
  | { kind: 'groupOpen'; groupOpen: GroupOpenData }
  | { kind: 'groupClose'; groupClose: GroupCloseData }
  | { kind: 'none' };

export interface SState {
  type: StateType;
  out: SState | null;
  transition: number;
  out1: SState | null;
  transition1: number;
  data: StateData;
  _did: number; // for debugging/printing to prevent loops
}

export function createState(type: StateType): SState {
  return {
    type,
    out: null,
    transition: TransitionNone,
    out1: null,
    transition1: TransitionNone,
    data: { kind: 'none' },
    _did: 0,
  };
}

export const matchState: SState = {
  type: StateType.Match,
  out: null,
  transition: TransitionNone,
  out1: null,
  transition1: TransitionNone,
  data: { kind: 'none' },
  _did: 0,
};
