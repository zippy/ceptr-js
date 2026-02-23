import { describe, it, expect } from 'vitest';
import { tokenize, parseSemtrex, TokenType, SemtrexParseError } from '../src/semtrex-parser.js';
import { createBaseSemTable, SYMBOLS } from '../src/base-defs.js';
import { SemTable } from '../src/sem-table.js';
import { semeq, NULL_STRUCTURE, SemanticType, type SemanticID } from '../src/semantic-id.js';
import { childAt, childCount, treeToString, type SemNode } from '../src/tree.js';

/** Create a SemTable with base defs + some test symbols. */
function makeTestSem(): SemTable {
  const sem = createBaseSemTable();
  const INT = { context: 0, semtype: SemanticType.STRUCTURE, id: 2 }; // INTEGER
  const FLT = { context: 0, semtype: SemanticType.STRUCTURE, id: 3 }; // FLOAT
  const STR = { context: 0, semtype: SemanticType.STRUCTURE, id: 5 }; // CSTRING
  const CHR = { context: 0, semtype: SemanticType.STRUCTURE, id: 4 }; // CHAR

  sem.defineSymbol(0, NULL_STRUCTURE, 'TEST_ROOT');
  sem.defineSymbol(0, NULL_STRUCTURE, 'TEST_SYMBOL');
  sem.defineSymbol(0, NULL_STRUCTURE, 'PARENT');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child1');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child2');
  sem.defineSymbol(0, NULL_STRUCTURE, 'child3');
  sem.defineSymbol(0, NULL_STRUCTURE, 'grandchild');
  sem.defineSymbol(0, NULL_STRUCTURE, 'HomeLocation');
  sem.defineSymbol(0, FLT, 'lat');
  sem.defineSymbol(0, FLT, 'lon');
  sem.defineSymbol(0, INT, 'MY_INT');
  sem.defineSymbol(0, STR, 'MY_STR');
  sem.defineSymbol(0, CHR, 'MY_CHAR');
  sem.defineSymbol(0, NULL_STRUCTURE, 'A');
  sem.defineSymbol(0, NULL_STRUCTURE, 'B');
  sem.defineSymbol(0, NULL_STRUCTURE, 'C');
  sem.defineSymbol(0, NULL_STRUCTURE, 'TASK');
  sem.defineSymbol(0, STR, 'TITLE');
  sem.defineSymbol(0, STR, 'STATUS');
  sem.defineSymbol(0, INT, 'PRIORITY');
  return sem;
}

describe('Tokenizer', () => {
  it('tokenizes simple semtrex', () => {
    const tokens = tokenize('/TEST_SYMBOL');
    expect(tokens[0].type).toBe(TokenType.SLASH);
    expect(tokens[1].type).toBe(TokenType.LABEL);
    expect(tokens[1].value).toBe('TEST_SYMBOL');
    expect(tokens[2].type).toBe(TokenType.EOF);
  });

  it('tokenizes complex expression', () => {
    const tokens = tokenize('/%HomeLocation/(lat=42.25,lon=73.25)');
    const types = tokens.map(t => t.type);
    expect(types).toEqual([
      TokenType.SLASH, TokenType.PERCENT, TokenType.LABEL,
      TokenType.SLASH, TokenType.LPAREN,
      TokenType.LABEL, TokenType.EQ, TokenType.FLOAT, TokenType.COMMA,
      TokenType.LABEL, TokenType.EQ, TokenType.FLOAT,
      TokenType.RPAREN, TokenType.EOF,
    ]);
  });

  it('tokenizes char and string literals', () => {
    const tokens = tokenize("/MY_CHAR='x'");
    expect(tokens[2].type).toBe(TokenType.EQ);
    expect(tokens[3].type).toBe(TokenType.CHAR_LIT);
    expect(tokens[3].value).toBe('x');

    const tokens2 = tokenize('/MY_STR="hello"');
    expect(tokens2[3].type).toBe(TokenType.STRING_LIT);
    expect(tokens2[3].value).toBe('hello');
  });

  it('tokenizes negation operators', () => {
    const tokens = tokenize('/!A');
    expect(tokens[1].type).toBe(TokenType.BANG);
    expect(tokens[2].type).toBe(TokenType.LABEL);
  });

  it('tokenizes bang-equals', () => {
    const tokens = tokenize('/MY_INT!=42');
    expect(tokens[2].type).toBe(TokenType.BANG);
    expect(tokens[3].type).toBe(TokenType.EQ);
    expect(tokens[4].type).toBe(TokenType.INT);
  });

  it('tokenizes symbol sets', () => {
    const tokens = tokenize('/{A,B,C}');
    const types = tokens.map(t => t.type);
    expect(types).toEqual([
      TokenType.SLASH, TokenType.LBRACE,
      TokenType.LABEL, TokenType.COMMA, TokenType.LABEL, TokenType.COMMA, TokenType.LABEL,
      TokenType.RBRACE, TokenType.EOF,
    ]);
  });

  it('tokenizes groups', () => {
    const tokens = tokenize('/<HomeLocation:lat+>');
    const types = tokens.map(t => t.type);
    expect(types).toEqual([
      TokenType.SLASH, TokenType.LANGLE,
      TokenType.LABEL, TokenType.COLON, TokenType.LABEL, TokenType.PLUS,
      TokenType.RANGLE, TokenType.EOF,
    ]);
  });

  it('tokenizes negative numbers', () => {
    const tokens = tokenize('/MY_INT=-5');
    expect(tokens[3].type).toBe(TokenType.INT);
    expect(tokens[3].value).toBe('-5');
  });
});

describe('Parser', () => {
  it('parses simple symbol match: /TEST_SYMBOL', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/TEST_SYMBOL');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL)).toBe(true);
    // First child should be SEMTREX_SYMBOL with surface = the resolved symbol
    const symChild = childAt(tree, 1)!;
    expect(semeq(symChild.symbol, SYMBOLS.SEMTREX_SYMBOL)).toBe(true);
    expect(semeq(symChild.surface as SemanticID, sem.symbolByName('TEST_SYMBOL')!)).toBe(true);
  });

  it('parses sequence of siblings: /PARENT/(child1,child2,child3)', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/PARENT/(child1,child2,child3)');
    // Root: SYMBOL_LITERAL for PARENT
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL)).toBe(true);
    // Second child of PARENT literal is the sequence
    const seq = childAt(tree, 2)!;
    expect(semeq(seq.symbol, SYMBOLS.SEMTREX_SEQUENCE)).toBe(true);
    expect(childCount(seq)).toBe(3);
  });

  it('parses nested descent: /PARENT/(child1/grandchild,child2)', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/PARENT/(child1/grandchild,child2)');
    const seq = childAt(tree, 2)!;
    expect(semeq(seq.symbol, SYMBOLS.SEMTREX_SEQUENCE)).toBe(true);
    // First element of sequence: child1 with grandchild as child pattern
    const child1Lit = childAt(seq, 1)!;
    expect(semeq(child1Lit.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL)).toBe(true);
    expect(childCount(child1Lit)).toBe(2); // SEMTREX_SYMBOL + child pattern
  });

  it('parses walk: /%TEST_SYMBOL', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/%TEST_SYMBOL');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_WALK)).toBe(true);
    const inner = childAt(tree, 1)!;
    expect(semeq(inner.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL)).toBe(true);
  });

  it('parses value literal (int): /MY_INT=42', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/MY_INT=42');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_VALUE_LITERAL)).toBe(true);
    const valChild = childAt(tree, 1)!;
    expect(valChild.surface).toBe(42);
  });

  it('parses value literal (float): /lat=42.25', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/lat=42.25');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_VALUE_LITERAL)).toBe(true);
    const valChild = childAt(tree, 1)!;
    expect(valChild.surface).toBe(42.25);
  });

  it('parses value literal (string): /MY_STR="hello"', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/MY_STR="hello"');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_VALUE_LITERAL)).toBe(true);
    const valChild = childAt(tree, 1)!;
    expect(valChild.surface).toBe('hello');
  });

  it("parses value literal (char): /MY_CHAR='x'", () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, "/MY_CHAR='x'");
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_VALUE_LITERAL)).toBe(true);
    const valChild = childAt(tree, 1)!;
    expect(valChild.surface).toBe('x');
  });

  it('parses negated value: /MY_INT!=42', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/MY_INT!=42');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_VALUE_LITERAL_NOT)).toBe(true);
  });

  it('parses capture group with quantifier: /<HomeLocation:lat+>', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/<HomeLocation:lat+>');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_GROUP)).toBe(true);
    // Group surface is the symbol it captures as
    expect(semeq(tree.surface as SemanticID, sem.symbolByName('HomeLocation')!)).toBe(true);
    // Child is ONE_OR_MORE
    const inner = childAt(tree, 1)!;
    expect(semeq(inner.symbol, SYMBOLS.SEMTREX_ONE_OR_MORE)).toBe(true);
  });

  it('parses alternation: /A|B', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/A|B');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_OR)).toBe(true);
    expect(childCount(tree)).toBe(2);
  });

  it('parses negation: /~A', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/~A');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_NOT)).toBe(true);
    const inner = childAt(tree, 1)!;
    expect(semeq(inner.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL)).toBe(true);
  });

  it('parses any with quantifier: /.+', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/.+');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_ONE_OR_MORE)).toBe(true);
    const inner = childAt(tree, 1)!;
    expect(semeq(inner.symbol, SYMBOLS.SEMTREX_SYMBOL_ANY)).toBe(true);
  });

  it('parses symbol not: /!A', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/!A');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL_NOT)).toBe(true);
  });

  it('parses symbol set: /{A,B,C}', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/{A,B,C}');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL)).toBe(true);
    const setNode = childAt(tree, 1)!;
    expect(semeq(setNode.symbol, SYMBOLS.SEMTREX_SYMBOL_SET)).toBe(true);
    expect(childCount(setNode)).toBe(3);
  });

  it('parses negated symbol set: /!{A,B}', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/!{A,B}');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL_NOT)).toBe(true);
    const setNode = childAt(tree, 1)!;
    expect(semeq(setNode.symbol, SYMBOLS.SEMTREX_SYMBOL_SET)).toBe(true);
    expect(childCount(setNode)).toBe(2);
  });

  it('parses value set: /MY_INT={1,2,3}', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/MY_INT={1,2,3}');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_VALUE_LITERAL)).toBe(true);
    const setNode = childAt(tree, 1)!;
    expect(semeq(setNode.symbol, SYMBOLS.SEMTREX_VALUE_SET)).toBe(true);
    expect(childCount(setNode)).toBe(3);
  });

  it('parses complex: /%HomeLocation/(lat=42.25,lon=73.25)', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/%HomeLocation/(lat=42.25,lon=73.25)');
    // WALK > SYMBOL_LITERAL(HomeLocation) > SEQUENCE(VALUE_LITERAL, VALUE_LITERAL)
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_WALK)).toBe(true);
    const homeLit = childAt(tree, 1)!;
    expect(semeq(homeLit.symbol, SYMBOLS.SEMTREX_SYMBOL_LITERAL)).toBe(true);
    const seq = childAt(homeLit, 2)!;
    expect(semeq(seq.symbol, SYMBOLS.SEMTREX_SEQUENCE)).toBe(true);
    expect(childCount(seq)).toBe(2);
    expect(semeq(childAt(seq, 1)!.symbol, SYMBOLS.SEMTREX_VALUE_LITERAL)).toBe(true);
    expect(semeq(childAt(seq, 2)!.symbol, SYMBOLS.SEMTREX_VALUE_LITERAL)).toBe(true);
  });

  it('parses zero-or-more: /A*', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/A*');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_ZERO_OR_MORE)).toBe(true);
  });

  it('parses zero-or-one: /A?', () => {
    const sem = makeTestSem();
    const tree = parseSemtrex(sem, '/A?');
    expect(semeq(tree.symbol, SYMBOLS.SEMTREX_ZERO_OR_ONE)).toBe(true);
  });

  it('throws on unknown symbol', () => {
    const sem = makeTestSem();
    expect(() => parseSemtrex(sem, '/UNKNOWN')).toThrow(SemtrexParseError);
  });

  it('throws on unterminated string', () => {
    expect(() => tokenize('/MY_STR="unclosed')).toThrow(SemtrexParseError);
  });
});
