# ceptr-js

Semantic trees and Semtrex pattern matching in TypeScript — a port of the [Ceptr](https://github.com/zippy/ceptr) C implementation.

## Install

```bash
npm install ceptr-js
```

## Quick start

```typescript
import {
  createBaseSemTable, NULL_STRUCTURE, STRUCTURES,
  newRoot, newStr, newInt, newEmpty,
  parseSemtrex, match, matchr, getMatchBySymbol, getMatchedNodes,
  embodyFromMatch,
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

## Semtrex pattern syntax

| Pattern | Meaning |
|---|---|
| `/SYMBOL` | Match a specific symbol at the root |
| `/.` | Match any symbol |
| `/SYMBOL=42` | Match symbol with a specific value |
| `/SYMBOL="hello"` | Match symbol with a string value |
| `/SYMBOL!=99` | Match symbol with negated value |
| `/A/(B,C,D)` | Match children sequence (prefix-matching) |
| `/A/B` | Descend into first child |
| `/A\|B` | Alternation — match A or B |
| `/.+` | One or more of any symbol |
| `/.*` | Zero or more of any symbol |
| `/.?` | Optional (zero or one) |
| `/~A` | Negation — match anything except A |
| `/!A` | Symbol-not — match any symbol that isn't A |
| `/{A,B}` | Symbol set — match A or B |
| `/!{A,B}` | Negated symbol set |
| `/%SYMBOL` | Walk — find symbol anywhere in subtree |
| `/<NAME:pattern>` | Capture group |

## Scripts

```bash
npm run build        # Compile TypeScript to dist/
npm test             # Run tests (vitest)
npm run test:watch   # Watch mode
npm run typecheck    # Type-check without emitting
```

## License

GPL-3.0
