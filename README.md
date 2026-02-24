# ceptr-js

Semantic trees and Semtrex pattern matching in TypeScript — a port of the [Ceptr](https://github.com/zippy/ceptr) C implementation.

Provides a universal data structure for representing hierarchical data with semantic meaning, plus a powerful pattern matching and transformation engine.

## Install

```bash
npm install ceptr-js
```

## Quick Start

```typescript
import {
  createBaseSemTable, NULL_STRUCTURE, STRUCTURES,
  newRoot, newStr, newInt,
  parseSemtrex, match, matchr, getMatchBySymbol, getMatchedNodes,
  embodyFromMatch, dumpSemtrex,
} from 'ceptr-js';

// 1. Create a semantic table and define your symbols
const sem = createBaseSemTable();
sem.defineSymbol(0, NULL_STRUCTURE, 'TASK');
sem.defineSymbol(0, STRUCTURES.CSTRING, 'TITLE');
sem.defineSymbol(0, STRUCTURES.CSTRING, 'STATUS');
sem.defineSymbol(0, STRUCTURES.INTEGER, 'PRIORITY');

// 2. Build a semantic tree
const task = newRoot(sem.symbolByName('TASK')!);
newStr(task, sem.symbolByName('TITLE')!, 'Build semtrex');
newStr(task, sem.symbolByName('STATUS')!, 'in-progress');
newInt(task, sem.symbolByName('PRIORITY')!, 1);

// 3. Match against a Semtrex pattern
const stx = parseSemtrex(sem, '/TASK/(TITLE,STATUS,.*)');
match(stx, task);  // => true

// 4. Capture groups — extract data from the tree
const stx2 = parseSemtrex(sem, '/TASK/<TITLE:TITLE>');
const results = matchr(stx2, task);
const nodes = getMatchedNodes(task, results![0]);
nodes[0].surface;  // => 'Build semtrex'

// 5. Embody — turn capture groups into a new tree
const embodied = embodyFromMatch(results!, task);
embodied!.surface;  // => 'Build semtrex'
```

## Core Concepts

### Semantic Trees

Every node (`SemNode`) carries three things:
- A **symbol** (`SemanticID`) — what the node represents
- A **surface** — the node's data value (number, string, boolean, SemanticID, Uint8Array, or null)
- An ordered list of **children** — other SemNodes

Symbols and structures are registered in a `SemTable`, which maps SemanticIDs to human-readable labels and structural metadata. The system comes with built-in structures (`INTEGER`, `FLOAT`, `CSTRING`, `SYMBOL`, `BLOB`, etc.) and semtrex-related symbols.

### Semtrex (Semantic Tree Regular Expressions)

Semtrex is a pattern matching language for semantic trees, analogous to regular expressions for strings. A semtrex pattern is parsed into a tree, compiled to a Thompson NFA, and matched against target trees using backtracking.

## API Reference

### Semantic IDs

```typescript
import { sid, semeq, SemanticType, NULL_SYMBOL, NULL_STRUCTURE } from 'ceptr-js';

const mySym = sid(0, SemanticType.SYMBOL, 42);
semeq(mySym, mySym);  // => true
```

### Definition Registry

```typescript
import { createBaseSemTable, STRUCTURES, NULL_STRUCTURE } from 'ceptr-js';

const sem = createBaseSemTable();

// Define symbols (returns a SemanticID)
const TASK   = sem.defineSymbol(0, NULL_STRUCTURE, 'TASK');
const TITLE  = sem.defineSymbol(0, STRUCTURES.CSTRING, 'TITLE');
const COUNT  = sem.defineSymbol(0, STRUCTURES.INTEGER, 'COUNT');

// Define composite structures
const POINT  = sem.defineStructure(0, 'POINT', latSym, lonSym);

// Look up by name
sem.symbolByName('TASK');       // => SemanticID
sem.structureByName('POINT');   // => SemanticID
sem.getSymbolLabel(TASK);       // => 'TASK'
```

### Tree Creation

```typescript
import { newRoot, newNode, newInt, newStr, newSym, newEmpty } from 'ceptr-js';

const root  = newRoot(TASK);                // null surface, no parent
const title = newStr(root, TITLE, 'hello'); // string surface, appended to root
const count = newInt(root, COUNT, 42);      // integer surface
const sym   = newSym(root, REF, otherSym);  // SemanticID surface
const empty = newEmpty(root, CONTAINER);    // null surface child
const any   = newNode(root, SYM, value);    // any surface type
```

### Tree Navigation

```typescript
import {
  childAt, getParent, root, nextSibling,
  nodeIndex, childCount, findChild,
  getPath, getByPath, pathEqual,
} from 'ceptr-js';

childAt(node, 1);          // 1-indexed child access
getParent(node);           // parent node (null if root)
root(node);                // walk up to tree root
nextSibling(node);         // next sibling (null if last)
nodeIndex(node);           // 1-indexed position in parent (0 if root)
childCount(node);          // number of children
findChild(node, symbol);   // first child matching symbol

getPath(node);             // => [1, 2, 1] (path from root)
getByPath(root, [1, 2]);   // navigate by path
pathEqual(a, b);           // compare paths
```

### Tree Mutation

```typescript
import {
  clone, detach, detachByPtr, replaceChild,
  addChild, morph, replaceNode, insertAt,
} from 'ceptr-js';

clone(node);                    // deep copy (detached from parent)
detach(parent, 2);              // remove child at index 2, returns it
detachByPtr(parent, childNode); // remove specific child by reference
replaceChild(parent, 2, newN);  // swap child at index 2, returns old
addChild(parent, node);         // append (detaches from old parent)
morph(dst, src);                // change symbol/surface in-place, keep children
replaceNode(target, repl);      // replace contents in-place, keep position
insertAt(root, [1, 2], node);   // insert at path, shift siblings right
```

### Tree Walking

```typescript
import { walk, nextInWalk } from 'ceptr-js';

// Visit all nodes depth-first
walk(tree, node => console.log(node.surface));

// Step-by-step traversal
let n = tree;
while (n) {
  console.log(n.surface);
  n = nextInWalk(n);
}
```

### Hashing

```typescript
import { treeHash } from 'ceptr-js';

const h = treeHash(tree);  // => unsigned 32-bit FNV-1a hash
// Covers symbol + surface + all children recursively
// Identical trees produce identical hashes
```

### Serialization

```typescript
import {
  treeToString, treeFromString,
  treeToJSON, treeFromJSON,
  treeSerialize, treeDeserialize,
} from 'ceptr-js';

// Human-readable string format
const str = treeToString(tree, sem);
//   (TASK
//     (TITLE:"Build semtrex")
//     (PRIORITY:1))
const restored = treeFromString(str, sem);

// JSON roundtrip
const json = treeToJSON(tree, sem);
const fromJson = treeFromJSON(json);

// Compact binary format (for storage/transport)
const bytes = treeSerialize(tree);   // => Uint8Array
const fromBin = treeDeserialize(bytes);
```

### Semtrex Pattern Matching

```typescript
import {
  parseSemtrex, dumpSemtrex,
  match, matchr,
  getMatchBySymbol, getMatchedNodes,
} from 'ceptr-js';

// Parse a pattern
const stx = parseSemtrex(sem, '/TASK/(TITLE,STATUS,.*)');

// Convert back to string (for debugging)
dumpSemtrex(stx, sem);  // => '/TASK/(TITLE,STATUS,.*)'

// Simple match test
match(stx, tree);  // => boolean

// Match with capture groups
const results = matchr(parseSemtrex(sem, '/TASK/<TITLE:TITLE>'), tree);
if (results) {
  const titleMatch = getMatchBySymbol(results, TITLE);
  const nodes = getMatchedNodes(tree, titleMatch!);
  // nodes[0].surface => 'Build semtrex'
}
```

### Tree Transformation

```typescript
import {
  embodyFromMatch, stxReplace, matchResultsToSemMap,
} from 'ceptr-js';

// Embody: create new tree from capture groups
const embodied = embodyFromMatch(results!, tree);

// Find-and-replace using semtrex
stxReplace(tree, t => matchr(pattern, t), replacementNode);

// Convert match results to a semantic map (for template filling)
const semMap = matchResultsToSemMap(results!, tree);
// Returns: (SEMANTIC_MAP
//   (SEMANTIC_LINK
//     (USAGE: <group symbol>)
//     (REPLACEMENT_VALUE: <matched subtree>))
//   ...)
```

## Semtrex Pattern Syntax

| Pattern | Meaning |
|---|---|
| `/SYMBOL` | Match a specific symbol at the root |
| `/.` | Match any symbol |
| `/SYMBOL=42` | Match symbol with a specific integer value |
| `/SYMBOL=3.14` | Match symbol with a float value |
| `/SYMBOL="hello"` | Match symbol with a string value |
| `/SYMBOL='x'` | Match symbol with a char value |
| `/SYMBOL!=99` | Match symbol with negated value |
| `/SYMBOL={1,2,3}` | Match symbol with value in set |
| `/A/(B,C,D)` | Match children sequence (prefix-matching) |
| `/A/B` | Descend — match B as first child of A |
| `/A\|B` | Alternation — match A or B |
| `/.+` | One or more of any symbol |
| `/.*` | Zero or more of any symbol |
| `/.?` | Optional (zero or one) |
| `/~A` | Negation — match if A does not match |
| `/!A` | Symbol-not — match any symbol except A |
| `/{A,B}` | Symbol set — match A or B |
| `/!{A,B}` | Negated symbol set |
| `/%SYMBOL` | Walk — find symbol anywhere in subtree |
| `/<NAME:pattern>` | Capture group — capture matched nodes as NAME |

## Architecture

```
semantic-id.ts          Core type system (SemanticID, SemanticType)
    |
    v
tree.ts                 SemNode CRUD, navigation, mutation, serialization
    |
    v
sem-table.ts            Definition registry (symbols, structures)
base-defs.ts            Built-in system definitions
    |
    v
semtrex-types.ts        FSA state machine types
    |
    v
semtrex-parser.ts       Tokenizer + recursive-descent parser + dumpSemtrex
    |
    v
semtrex-fsa.ts          Thompson NFA construction
    |
    v
semtrex-match.ts        Backtracking NFA matcher
    |
    v
semtrex-replace.ts      Tree transformation (embody, replace, semantic maps)
```

## Scripts

```bash
npm run build        # Compile TypeScript to dist/
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode
npm run typecheck    # Type-check without emitting
```

## License

Copyright (C) 2013-2025, Ceptr LLC & The MetaCurrency Project (Eric Harris-Braun, Arthur Brock, et. al.)

This program is free software: you can redistribute it and/or modify it under the terms of the license provided in the LICENSE file (GPLv3).

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
