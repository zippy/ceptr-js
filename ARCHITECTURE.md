# Architecture

## Overview

ceptr-js implements two core ideas from the Ceptr project:

1. **Semantic trees** — a universal data structure where every node carries a semantic identifier (symbol) and an optional value.
2. **Semtrex** (Semantic Tree Regular Expressions) — a pattern language for querying and extracting data from semantic trees, analogous to regex for strings.

The codebase is pure TypeScript with zero runtime dependencies.

## Module dependency graph

```
index.ts  (public API)
  │
  ├── semantic-id.ts       ← core type system
  ├── tree.ts              ← semantic tree nodes
  ├── sem-table.ts         ← definition registry
  ├── base-defs.ts         ← built-in symbols & structures
  ├── semtrex-types.ts     ← FSA state types
  ├── semtrex-parser.ts    ← string → semtrex tree
  ├── semtrex-fsa.ts       ← semtrex tree → NFA
  ├── semtrex-match.ts     ← NFA execution against trees
  └── semtrex-replace.ts   ← tree rewriting from matches
```

Dependencies flow downward: higher layers import from lower layers.

```
semantic-id
     │
   tree ← sem-table ← base-defs
     │         │
semtrex-types  │
     │         │
semtrex-parser─┘
     │
semtrex-fsa
     │
semtrex-match
     │
semtrex-replace
```

## Core concepts

### SemanticID

Every entity in the system is identified by a triple:

```typescript
interface SemanticID {
  context: number;       // namespace (0 = system)
  semtype: SemanticType; // SYMBOL | STRUCTURE | PROCESS | RECEPTOR | PROTOCOL
  id: number;            // unique within context+semtype
}
```

Symbols and structures are the two primary semtypes. A **symbol** names what a tree node represents. A **structure** describes the shape of data a symbol holds (like a schema).

### SemNode (tree node)

```typescript
interface SemNode {
  symbol: SemanticID;
  surface: Surface;       // number | string | boolean | SemanticID | Uint8Array | null
  children: SemNode[];
  parent: SemNode | null;
}
```

Trees are ordered — child position matters. Paths are 1-indexed arrays of child positions (e.g. `[1, 2, 3]` = first child → its second child → its third child).

### SemTable (definition registry)

A registry that maps SemanticIDs to human-readable labels and structural definitions. Supports multiple contexts for namespace isolation. Used by the parser to resolve symbol names in pattern strings.

## Semtrex pipeline

Matching a pattern against a tree follows a three-stage pipeline:

```
   pattern string
        │
   ┌────▼────┐
   │  Parser  │  semtrex-parser.ts
   │          │  Recursive-descent parser, produces a semtrex tree
   └────┬─────┘  (a SemNode tree using SEMTREX_* symbols)
        │
  semtrex tree
        │
   ┌────▼────┐
   │   FSA   │  semtrex-fsa.ts
   │ Builder │  Thompson NFA construction
   └────┬────┘  (array of SState nodes with transitions)
        │
      NFA
        │
   ┌────▼─────┐
   │ Matcher  │  semtrex-match.ts
   │          │  Walks NFA against target tree with backtracking
   └────┬─────┘
        │
   match result (boolean or MatchResult[])
```

### Parser (semtrex-parser.ts)

Tokenizes and parses a semtrex string into a tree of `SEMTREX_*` nodes. The grammar supports:

- Symbol matching, value literals (int, float, string, char)
- Sequences, alternation, repetition (`+`, `*`, `?`)
- Descent (`/`), walk (`%`), negation (`~`, `!`)
- Symbol sets (`{A,B}`), capture groups (`<NAME:pattern>`)

### FSA builder (semtrex-fsa.ts)

Converts the semtrex tree into a Thompson NFA. Each semtrex node becomes one or more `SState` entries. Key state types:

| StateType | Purpose |
|---|---|
| Symbol | Match a specific symbol |
| Any | Match any symbol (wildcard) |
| Value | Match a symbol with a specific value |
| Split | Branch point for alternation / repetition |
| Descend | Enter the first child of the current node |
| Walk | Search entire subtree for a match |
| Not | Invert the match result |
| GroupOpen/Close | Mark capture group boundaries |
| Match | Terminal accept state |

Transitions carry level-relative adjustments to navigate tree depth (down to children, across to siblings, up to parent).

### Matcher (semtrex-match.ts)

Executes the NFA against a target tree. Two entry points:

- `match()` — returns `boolean`
- `matchr()` — returns `MatchResult[]` with capture group details (symbol, path, sibling count)

The matcher maintains a backtracking stack for split states and tracks group boundaries to produce capture results.

### Replace (semtrex-replace.ts)

Utilities for working with match results:

- `embodyFromMatch()` — clones matched nodes into a new tree organized by capture group symbols
- `stxReplace()` — find-and-replace on trees using semtrex patterns

## File inventory

| File | Lines | Role |
|---|---|---|
| `semantic-id.ts` | ~70 | SemanticID type, constructors, equality |
| `tree.ts` | ~250 | SemNode CRUD, navigation, paths, serialization, walking |
| `sem-table.ts` | ~100 | Symbol/structure definition registry |
| `base-defs.ts` | ~120 | Built-in system symbols and structures |
| `semtrex-types.ts` | ~60 | FSA state types and transition constants |
| `semtrex-parser.ts` | ~600 | Tokenizer and recursive-descent parser |
| `semtrex-fsa.ts` | ~260 | Thompson NFA construction |
| `semtrex-match.ts` | ~300 | Backtracking tree matcher |
| `semtrex-replace.ts` | ~80 | Tree rewriting from match results |
| `index.ts` | ~50 | Re-exports public API |

## Testing

Tests live in `test/` and use Vitest. Each module has a corresponding test file covering its core behavior. Run with `npm test`.
