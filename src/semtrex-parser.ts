/**
 * Semtrex string parser — converts human-readable semtrex expressions
 * into semtrex trees (SemNode trees with SEMTREX_* symbols).
 *
 * Uses a tokenizer + recursive descent parser rather than the C
 * implementation's bootstrap-via-semtrex-on-ASCII-trees approach.
 *
 * Grammar:
 *   semtrex      = "/" element
 *   element      = walk | not | atom postfix? | group postfix?
 *   walk         = "%" element
 *   not          = "~" element
 *   group        = "<" LABEL ":" siblings ">"
 *   atom         = symbolMatch | valueMatch | any | "(" siblings ")" | descend
 *   descend      = "/" element
 *   siblings     = orExpr
 *   orExpr       = seqExpr ("|" seqExpr)*
 *   seqExpr      = element ("," element)*
 *   symbolMatch  = ["!"] LABEL | ["!"] "{" LABEL ("," LABEL)* "}"
 *   valueMatch   = LABEL ["!"] "=" value | LABEL ["!"] "={" value ("," value)* "}"
 *   value        = INT | FLOAT | "'" CHAR "'" | '"' STRING '"'
 *   any          = "."
 *   postfix      = "+" | "*" | "?"
 *   LABEL        = [a-zA-Z_][a-zA-Z0-9_]*
 *   INT          = [0-9]+
 *   FLOAT        = [0-9]+ "." [0-9]+
 */

import { type SemanticID, semeq, NULL_SYMBOL } from './semantic-id.js';
import { type SemNode, newRoot, newEmpty, newNode, newSym, newStr, newInt } from './tree.js';
import { SYMBOLS } from './base-defs.js';
import { SemTable } from './sem-table.js';

// ---- Tokenizer ----

export enum TokenType {
  SLASH = 'SLASH',
  PERCENT = 'PERCENT',
  DOT = 'DOT',
  COMMA = 'COMMA',
  PIPE = 'PIPE',
  STAR = 'STAR',
  PLUS = 'PLUS',
  QUESTION = 'QUESTION',
  TILDE = 'TILDE',
  BANG = 'BANG',
  EQ = 'EQ',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  LANGLE = 'LANGLE',
  RANGLE = 'RANGLE',
  COLON = 'COLON',
  LABEL = 'LABEL',
  INT = 'INT',
  FLOAT = 'FLOAT',
  CHAR_LIT = 'CHAR_LIT',
  STRING_LIT = 'STRING_LIT',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const c = input[i];

    // Skip whitespace
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    // Single-character tokens
    const singles: Record<string, TokenType> = {
      '/': TokenType.SLASH,
      '%': TokenType.PERCENT,
      '.': TokenType.DOT,
      ',': TokenType.COMMA,
      '|': TokenType.PIPE,
      '*': TokenType.STAR,
      '+': TokenType.PLUS,
      '?': TokenType.QUESTION,
      '~': TokenType.TILDE,
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      '{': TokenType.LBRACE,
      '}': TokenType.RBRACE,
      '<': TokenType.LANGLE,
      '>': TokenType.RANGLE,
      ':': TokenType.COLON,
    };

    // Check for != (bang-eq) vs ! (bang)
    if (c === '!' && i + 1 < input.length && input[i + 1] === '=') {
      tokens.push({ type: TokenType.BANG, pos: i, value: '!' });
      i++;
      tokens.push({ type: TokenType.EQ, pos: i, value: '=' });
      i++;
      continue;
    }
    if (c === '!') {
      tokens.push({ type: TokenType.BANG, pos: i, value: '!' });
      i++;
      continue;
    }
    if (c === '=') {
      tokens.push({ type: TokenType.EQ, pos: i, value: '=' });
      i++;
      continue;
    }

    if (c in singles) {
      tokens.push({ type: singles[c], pos: i, value: c });
      i++;
      continue;
    }

    // Character literal: 'x'
    if (c === "'") {
      if (i + 2 < input.length && input[i + 2] === "'") {
        tokens.push({ type: TokenType.CHAR_LIT, pos: i, value: input[i + 1] });
        i += 3;
        continue;
      }
      throw new SemtrexParseError(`Unterminated character literal`, i);
    }

    // String literal: "..."
    if (c === '"') {
      let j = i + 1;
      while (j < input.length && input[j] !== '"') {
        if (input[j] === '\\') j++; // skip escaped char
        j++;
      }
      if (j >= input.length) throw new SemtrexParseError(`Unterminated string literal`, i);
      tokens.push({ type: TokenType.STRING_LIT, pos: i, value: input.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    // Number: integer or float
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
      if (j < input.length && input[j] === '.' && j + 1 < input.length && input[j + 1] >= '0' && input[j + 1] <= '9') {
        j++; // skip dot
        while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
        tokens.push({ type: TokenType.FLOAT, pos: i, value: input.slice(i, j) });
      } else {
        tokens.push({ type: TokenType.INT, pos: i, value: input.slice(i, j) });
      }
      i = j;
      continue;
    }

    // Negative number: -digits or -digits.digits
    if (c === '-' && i + 1 < input.length && input[i + 1] >= '0' && input[i + 1] <= '9') {
      let j = i + 1;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
      if (j < input.length && input[j] === '.' && j + 1 < input.length && input[j + 1] >= '0' && input[j + 1] <= '9') {
        j++;
        while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
        tokens.push({ type: TokenType.FLOAT, pos: i, value: input.slice(i, j) });
      } else {
        tokens.push({ type: TokenType.INT, pos: i, value: input.slice(i, j) });
      }
      i = j;
      continue;
    }

    // Label: [a-zA-Z_][a-zA-Z0-9_]*
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i + 1;
      while (j < input.length && ((input[j] >= 'a' && input[j] <= 'z') || (input[j] >= 'A' && input[j] <= 'Z') || (input[j] >= '0' && input[j] <= '9') || input[j] === '_')) j++;
      tokens.push({ type: TokenType.LABEL, pos: i, value: input.slice(i, j) });
      i = j;
      continue;
    }

    throw new SemtrexParseError(`Unexpected character '${c}'`, i);
  }

  tokens.push({ type: TokenType.EOF, pos: i, value: '' });
  return tokens;
}

// ---- Parser ----

export class SemtrexParseError extends Error {
  constructor(message: string, public pos: number) {
    super(`Semtrex parse error at position ${pos}: ${message}`);
    this.name = 'SemtrexParseError';
  }
}

class Parser {
  private tokens: Token[];
  private pos = 0;
  private sem: SemTable;

  constructor(tokens: Token[], sem: SemTable) {
    this.tokens = tokens;
    this.sem = sem;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new SemtrexParseError(`Expected ${type} but got ${t.type} ('${t.value}')`, t.pos);
    }
    return this.advance();
  }

  private match(type: TokenType): boolean {
    if (this.peek().type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  private resolveSymbol(name: string, pos: number): SemanticID {
    const sym = this.sem.symbolByName(name);
    if (!sym) {
      throw new SemtrexParseError(`Unknown symbol '${name}'`, pos);
    }
    return sym;
  }

  /**
   * Entry point: semtrex = "/" siblings
   * The top level allows alternation and sequences, not just a single element.
   */
  parse(): SemNode {
    this.expect(TokenType.SLASH);
    const result = this.parseSiblings();
    if (this.peek().type !== TokenType.EOF) {
      throw new SemtrexParseError(`Unexpected token '${this.peek().value}'`, this.peek().pos);
    }
    return result;
  }

  /**
   * element = walk | not | atom postfix? | group postfix?
   */
  private parseElement(): SemNode {
    const t = this.peek();

    if (t.type === TokenType.PERCENT) {
      return this.parseWalk();
    }
    if (t.type === TokenType.TILDE) {
      return this.parseNot();
    }
    if (t.type === TokenType.LANGLE) {
      const group = this.parseGroup();
      return this.maybePostfix(group);
    }

    const atom = this.parseAtom();
    return this.maybePostfix(atom);
  }

  /**
   * walk = "%" element
   */
  private parseWalk(): SemNode {
    this.expect(TokenType.PERCENT);
    const walkNode = newEmpty(null, SYMBOLS.SEMTREX_WALK);
    const child = this.parseElement();
    child.parent = walkNode;
    walkNode.children.push(child);
    return walkNode;
  }

  /**
   * not = "~" element
   */
  private parseNot(): SemNode {
    this.expect(TokenType.TILDE);
    const notNode = newEmpty(null, SYMBOLS.SEMTREX_NOT);
    const child = this.parseElement();
    child.parent = notNode;
    notNode.children.push(child);
    return notNode;
  }

  /**
   * group = "<" LABEL ":" siblings ">"
   */
  private parseGroup(): SemNode {
    this.expect(TokenType.LANGLE);
    const labelTok = this.expect(TokenType.LABEL);
    this.expect(TokenType.COLON);

    const groupSym = this.resolveSymbol(labelTok.value, labelTok.pos);
    const groupNode = newNode(null, SYMBOLS.SEMTREX_GROUP, groupSym);

    const body = this.parseSiblings();
    body.parent = groupNode;
    groupNode.children.push(body);

    this.expect(TokenType.RANGLE);
    return groupNode;
  }

  /**
   * atom = symbolMatch | valueMatch | any | "(" siblings ")" | descend
   */
  private parseAtom(): SemNode {
    const t = this.peek();

    // descend: "/" element
    if (t.type === TokenType.SLASH) {
      this.advance();
      const descendNode = newEmpty(null, SYMBOLS.SEMTREX_DESCEND);
      const child = this.parseElement();
      child.parent = descendNode;
      descendNode.children.push(child);
      return descendNode;
    }

    // any: "."
    if (t.type === TokenType.DOT) {
      this.advance();
      return newEmpty(null, SYMBOLS.SEMTREX_SYMBOL_ANY);
    }

    // parenthesized siblings: "(" siblings ")"
    if (t.type === TokenType.LPAREN) {
      this.advance();
      const inner = this.parseSiblings();
      this.expect(TokenType.RPAREN);
      return inner;
    }

    // "!" prefix for negated symbol literal or set
    if (t.type === TokenType.BANG) {
      return this.parseNegatedSymbol();
    }

    // LABEL — could be symbol literal, value match, or symbol set
    if (t.type === TokenType.LABEL) {
      return this.parseSymbolOrValue();
    }

    // "{" — symbol set
    if (t.type === TokenType.LBRACE) {
      return this.parseSymbolSet(false);
    }

    throw new SemtrexParseError(`Unexpected token '${t.value}' in atom`, t.pos);
  }

  /**
   * Parse LABEL followed by optional value match or descend.
   * symbolMatch = LABEL
   * valueMatch  = LABEL ["!"] "=" value | LABEL ["!"] "={" value, ... "}"
   * also: LABEL / element (symbol with child)
   */
  private parseSymbolOrValue(): SemNode {
    const labelTok = this.advance(); // consume LABEL
    const sym = this.resolveSymbol(labelTok.value, labelTok.pos);

    // Check for value match: LABEL[!]= or LABEL[!]={
    if (this.peek().type === TokenType.BANG || this.peek().type === TokenType.EQ) {
      return this.parseValueLiteral(sym, labelTok.pos);
    }

    // Symbol literal, possibly with children via /
    const isNot = false;
    const litSymbol = isNot ? SYMBOLS.SEMTREX_SYMBOL_LITERAL_NOT : SYMBOLS.SEMTREX_SYMBOL_LITERAL;
    const litNode = newEmpty(null, litSymbol);
    newSym(litNode, SYMBOLS.SEMTREX_SYMBOL, sym);

    // Check for descend: LABEL / child
    if (this.peek().type === TokenType.SLASH) {
      this.advance();
      const child = this.parseElement();
      child.parent = litNode;
      litNode.children.push(child);
    }

    return litNode;
  }

  /**
   * Parse value literal: assumes symbol already consumed.
   * LABEL [!] = value
   * LABEL [!] ={ value, value, ... }
   */
  private parseValueLiteral(sym: SemanticID, pos: number): SemNode {
    let isNot = false;
    if (this.peek().type === TokenType.BANG) {
      this.advance();
      isNot = true;
    }
    this.expect(TokenType.EQ);

    const vlSym = isNot ? SYMBOLS.SEMTREX_VALUE_LITERAL_NOT : SYMBOLS.SEMTREX_VALUE_LITERAL;

    // Check for value set: ={...}
    if (this.peek().type === TokenType.LBRACE) {
      this.advance();
      const vlNode = newEmpty(null, vlSym);
      const setNode = newEmpty(vlNode, SYMBOLS.SEMTREX_VALUE_SET);
      this.parseValueInto(setNode, sym);
      while (this.match(TokenType.COMMA)) {
        this.parseValueInto(setNode, sym);
      }
      this.expect(TokenType.RBRACE);
      return vlNode;
    }

    // Single value
    const vlNode = newEmpty(null, vlSym);
    this.parseValueInto(vlNode, sym);
    return vlNode;
  }

  /**
   * Parse a single value token and add as child node with given symbol.
   */
  private parseValueInto(parent: SemNode, sym: SemanticID): void {
    const t = this.peek();
    if (t.type === TokenType.INT) {
      this.advance();
      newInt(parent, sym, parseInt(t.value, 10));
    } else if (t.type === TokenType.FLOAT) {
      this.advance();
      newNode(parent, sym, parseFloat(t.value));
    } else if (t.type === TokenType.CHAR_LIT) {
      this.advance();
      newStr(parent, sym, t.value);
    } else if (t.type === TokenType.STRING_LIT) {
      this.advance();
      newStr(parent, sym, t.value);
    } else {
      throw new SemtrexParseError(`Expected value but got '${t.value}'`, t.pos);
    }
  }

  /**
   * Parse negated symbol: "!" LABEL or "!" "{" labels "}"
   */
  private parseNegatedSymbol(): SemNode {
    this.expect(TokenType.BANG);

    if (this.peek().type === TokenType.LBRACE) {
      return this.parseSymbolSet(true);
    }

    const labelTok = this.expect(TokenType.LABEL);
    const sym = this.resolveSymbol(labelTok.value, labelTok.pos);

    const litNode = newEmpty(null, SYMBOLS.SEMTREX_SYMBOL_LITERAL_NOT);
    newSym(litNode, SYMBOLS.SEMTREX_SYMBOL, sym);

    // Check for descend
    if (this.peek().type === TokenType.SLASH) {
      this.advance();
      const child = this.parseElement();
      child.parent = litNode;
      litNode.children.push(child);
    }

    return litNode;
  }

  /**
   * Parse symbol set: "{" LABEL ("," LABEL)* "}"
   */
  private parseSymbolSet(isNot: boolean): SemNode {
    this.expect(TokenType.LBRACE);
    const litSym = isNot ? SYMBOLS.SEMTREX_SYMBOL_LITERAL_NOT : SYMBOLS.SEMTREX_SYMBOL_LITERAL;
    const litNode = newEmpty(null, litSym);
    const setNode = newEmpty(litNode, SYMBOLS.SEMTREX_SYMBOL_SET);

    const firstLabel = this.expect(TokenType.LABEL);
    newSym(setNode, SYMBOLS.SEMTREX_SYMBOL, this.resolveSymbol(firstLabel.value, firstLabel.pos));

    while (this.match(TokenType.COMMA)) {
      const nextLabel = this.expect(TokenType.LABEL);
      newSym(setNode, SYMBOLS.SEMTREX_SYMBOL, this.resolveSymbol(nextLabel.value, nextLabel.pos));
    }

    this.expect(TokenType.RBRACE);
    return litNode;
  }

  /**
   * siblings = orExpr
   */
  private parseSiblings(): SemNode {
    return this.parseOrExpr();
  }

  /**
   * orExpr = seqExpr ("|" seqExpr)*
   */
  private parseOrExpr(): SemNode {
    let left = this.parseSeqExpr();

    while (this.peek().type === TokenType.PIPE) {
      this.advance();
      const right = this.parseSeqExpr();
      const orNode = newEmpty(null, SYMBOLS.SEMTREX_OR);
      left.parent = orNode;
      orNode.children.push(left);
      right.parent = orNode;
      orNode.children.push(right);
      left = orNode;
    }

    return left;
  }

  /**
   * seqExpr = element ("," element)*
   */
  private parseSeqExpr(): SemNode {
    const first = this.parseElement();

    if (this.peek().type !== TokenType.COMMA) {
      return first;
    }

    const seqNode = newEmpty(null, SYMBOLS.SEMTREX_SEQUENCE);
    first.parent = seqNode;
    seqNode.children.push(first);

    while (this.match(TokenType.COMMA)) {
      const next = this.parseElement();
      next.parent = seqNode;
      seqNode.children.push(next);
    }

    return seqNode;
  }

  /**
   * Apply postfix operator if present: +, *, ?
   */
  private maybePostfix(node: SemNode): SemNode {
    const t = this.peek();
    if (t.type === TokenType.STAR) {
      this.advance();
      const wrapper = newEmpty(null, SYMBOLS.SEMTREX_ZERO_OR_MORE);
      node.parent = wrapper;
      wrapper.children.push(node);
      return wrapper;
    }
    if (t.type === TokenType.PLUS) {
      this.advance();
      const wrapper = newEmpty(null, SYMBOLS.SEMTREX_ONE_OR_MORE);
      node.parent = wrapper;
      wrapper.children.push(node);
      return wrapper;
    }
    if (t.type === TokenType.QUESTION) {
      this.advance();
      const wrapper = newEmpty(null, SYMBOLS.SEMTREX_ZERO_OR_ONE);
      node.parent = wrapper;
      wrapper.children.push(node);
      return wrapper;
    }
    return node;
  }
}

// ---- Public API ----

/**
 * Parse a semtrex string into a semtrex tree.
 *
 * @param sem - SemTable for symbol name resolution
 * @param input - Semtrex expression string (e.g. "/%HomeLocation/(lat=42.25,lon=73.25)")
 * @returns SemNode tree representing the semtrex pattern
 */
export function parseSemtrex(sem: SemTable, input: string): SemNode {
  const tokens = tokenize(input);
  const parser = new Parser(tokens, sem);
  return parser.parse();
}
