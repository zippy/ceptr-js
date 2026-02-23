/**
 * SemTable — registry for symbol and structure definitions.
 *
 * Ported from ceptr/src/def.h and def.c
 */

import {
  type SemanticID, SemanticType, sid, semeq,
  SYS_CONTEXT, NULL_STRUCTURE,
} from './semantic-id.js';

export interface SymbolDef {
  label: string;
  structure: SemanticID;
}

export interface StructureDef {
  label: string;
  parts: SemanticID[];
}

interface ContextStore {
  symbols: Map<number, SymbolDef>;
  structures: Map<number, StructureDef>;
  nextSymbolId: number;
  nextStructureId: number;
}

export class SemTable {
  private contexts = new Map<number, ContextStore>();

  private ensureContext(context: number): ContextStore {
    let store = this.contexts.get(context);
    if (!store) {
      store = {
        symbols: new Map(),
        structures: new Map(),
        nextSymbolId: 1,
        nextStructureId: 1,
      };
      this.contexts.set(context, store);
    }
    return store;
  }

  /** Define a new symbol in the given context. Returns its SemanticID. */
  defineSymbol(context: number, structureId: SemanticID, label: string): SemanticID {
    const store = this.ensureContext(context);
    const id = store.nextSymbolId++;
    store.symbols.set(id, { label, structure: structureId });
    return sid(context, SemanticType.SYMBOL, id);
  }

  /** Define a new structure in the given context. Returns its SemanticID. */
  defineStructure(context: number, label: string, ...parts: SemanticID[]): SemanticID {
    const store = this.ensureContext(context);
    const id = store.nextStructureId++;
    store.structures.set(id, { label, parts });
    return sid(context, SemanticType.STRUCTURE, id);
  }

  /** Look up a symbol definition. */
  getSymbolDef(symId: SemanticID): SymbolDef | undefined {
    return this.contexts.get(symId.context)?.symbols.get(symId.id);
  }

  /** Look up a structure definition. */
  getStructureDef(structId: SemanticID): StructureDef | undefined {
    return this.contexts.get(structId.context)?.structures.get(structId.id);
  }

  /** Get human-readable label for a symbol. */
  getSymbolLabel(symId: SemanticID): string | undefined {
    return this.getSymbolDef(symId)?.label;
  }

  /** Get human-readable label for a structure. */
  getStructureLabel(structId: SemanticID): string | undefined {
    return this.getStructureDef(structId)?.label;
  }

  /**
   * Resolve a symbol name to its SemanticID.
   * Searches all contexts (like get_symbol in C).
   */
  symbolByName(name: string): SemanticID | undefined {
    for (const [ctx, store] of this.contexts) {
      for (const [id, def] of store.symbols) {
        if (def.label === name) {
          return sid(ctx, SemanticType.SYMBOL, id);
        }
      }
    }
    return undefined;
  }

  /**
   * Resolve a structure name to its SemanticID.
   */
  structureByName(name: string): SemanticID | undefined {
    for (const [ctx, store] of this.contexts) {
      for (const [id, def] of store.structures) {
        if (def.label === name) {
          return sid(ctx, SemanticType.STRUCTURE, id);
        }
      }
    }
    return undefined;
  }
}
