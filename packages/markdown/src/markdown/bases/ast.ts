import { tokenizeExpr, type Token } from "./lexer";

export type ExprNode =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "regexp"; pattern: string; flags: string }
  | { kind: "list"; items: ExprNode[] }
  | { kind: "ident"; name: string }
  | { kind: "unary"; op: string; arg: ExprNode }
  | { kind: "binary"; op: string; left: ExprNode; right: ExprNode }
  | { kind: "member"; object: ExprNode; property: string }
  | { kind: "index"; object: ExprNode; index: ExprNode }
  | { kind: "call"; callee: ExprNode; args: ExprNode[] };

class ExprParser {
  private pos = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ExprNode {
    if (this.tokens.length === 0) {
      return { kind: "literal", value: null };
    }
    return this.parseOr();
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token | undefined {
    const token = this.tokens[this.pos];
    this.pos += 1;
    return token;
  }

  private matchOp(...ops: string[]): string | undefined {
    const token = this.peek();
    if (token?.kind === "op" && ops.includes(token.value)) {
      this.pos += 1;
      return token.value;
    }
    return undefined;
  }

  private matchPunc(value: string): boolean {
    const token = this.peek();
    if (token?.kind === "punc" && token.value === value) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  private parseOr(): ExprNode {
    let left = this.parseAnd();
    while (this.matchOp("||")) {
      left = { kind: "binary", op: "||", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ExprNode {
    let left = this.parseEquality();
    while (this.matchOp("&&")) {
      left = { kind: "binary", op: "&&", left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): ExprNode {
    let left = this.parseComparison();
    for (;;) {
      const op = this.matchOp("==", "!=");
      if (!op) {
        break;
      }
      left = { kind: "binary", op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): ExprNode {
    let left = this.parseAdditive();
    for (;;) {
      const op = this.matchOp("<", ">", "<=", ">=");
      if (!op) {
        break;
      }
      left = { kind: "binary", op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): ExprNode {
    let left = this.parseMultiplicative();
    for (;;) {
      const op = this.matchOp("+", "-");
      if (!op) {
        break;
      }
      left = { kind: "binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): ExprNode {
    let left = this.parseUnary();
    for (;;) {
      const op = this.matchOp("*", "/", "%");
      if (!op) {
        break;
      }
      left = { kind: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    const op = this.matchOp("!", "-", "+");
    if (op) {
      return { kind: "unary", op, arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ExprNode {
    let node = this.parsePrimary();
    for (;;) {
      if (this.matchPunc(".")) {
        const next = this.consume();
        const property =
          next && (next.kind === "ident" || next.kind === "string")
            ? next.value
            : "";
        node = { kind: "member", object: node, property };
        continue;
      }
      if (this.matchPunc("(")) {
        node = { kind: "call", callee: node, args: this.parseArgList(")") };
        continue;
      }
      if (this.matchPunc("[")) {
        const index = this.parseOr();
        this.matchPunc("]");
        node = { kind: "index", object: node, index };
        continue;
      }
      break;
    }
    return node;
  }

  private parseArgList(closing: string): ExprNode[] {
    const args: ExprNode[] = [];
    if (this.matchPunc(closing)) {
      return args;
    }
    while (this.pos < this.tokens.length) {
      args.push(this.parseOr());
      if (this.matchPunc(",")) {
        continue;
      }
      this.matchPunc(closing);
      break;
    }
    return args;
  }

  private parsePrimary(): ExprNode {
    if (this.matchPunc("(")) {
      const inner = this.parseOr();
      this.matchPunc(")");
      return inner;
    }
    if (this.matchPunc("[")) {
      return { kind: "list", items: this.parseArgList("]") };
    }
    const token = this.consume();
    if (!token) {
      return { kind: "literal", value: null };
    }
    return tokenToNode(token);
  }
}

function tokenToNode(token: Token): ExprNode {
  if (token.kind === "number" || token.kind === "string") {
    return { kind: "literal", value: token.value };
  }
  if (token.kind === "regexp") {
    return { kind: "regexp", pattern: token.pattern, flags: token.flags };
  }
  if (token.kind === "ident") {
    if (token.value === "true") {
      return { kind: "literal", value: true };
    }
    if (token.value === "false") {
      return { kind: "literal", value: false };
    }
    if (token.value === "null" || token.value === "undefined") {
      return { kind: "literal", value: null };
    }
    return { kind: "ident", name: token.value };
  }
  return { kind: "literal", value: null };
}

const astCache = new Map<string, ExprNode>();

export function parseExpr(source: string): ExprNode {
  const cached = astCache.get(source);
  if (cached) {
    return cached;
  }
  const ast = new ExprParser(tokenizeExpr(source)).parse();
  astCache.set(source, ast);
  return ast;
}
