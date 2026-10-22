/**
 * VS Code's when-clauses, for the menus Lumière contributes: `a && b`,
 * `a || b`, `!a`, `(…)`, `key == 'value'`, `key != value`, and a key alone
 * (true when its value is truthy). Anything else (`=~`, `in`, `<`) makes the
 * clause false: a menu item shows only when its clause is understood and
 * true, never by accident.
 */

type Token =
  | {
      readonly kind: "op";
      readonly text: "&&" | "||" | "!" | "(" | ")" | "==" | "!=";
    }
  | { readonly kind: "value"; readonly text: string; readonly quoted: boolean };

/** Whether `expression` holds for the keys `lookup` gives. Empty is true. */
export function evaluateWhen(
  expression: string | undefined,
  lookup: (key: string) => unknown,
): boolean {
  if (!expression?.trim()) {
    return true;
  }
  const tokens = tokenize(expression);
  if (!tokens) {
    return false;
  }
  const parser = new Parser(tokens, lookup);
  const result = parser.or();
  return parser.done() && result === true;
}

const OPERATORS = ["&&", "||", "==", "!=", "!", "(", ")"] as const;

function tokenize(text: string): Token[] | undefined {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const char = text[at] ?? "";
    if (/\s/.test(char)) {
      at++;
      continue;
    }
    const op = OPERATORS.find((item) => text.startsWith(item, at));
    // `!=` before `!`, and `!` before a key; `=` alone, `=~`, `<`… are not understood.
    if (op && !(op === "!" && text[at + 1] === "=")) {
      tokens.push({ kind: "op", text: op });
      at += op.length;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = text.indexOf(char, at + 1);
      if (end < 0) {
        return undefined;
      }
      tokens.push({
        kind: "value",
        text: text.slice(at + 1, end),
        quoted: true,
      });
      at = end + 1;
      continue;
    }
    const word = /^[\w.:\-/]+/.exec(text.slice(at))?.[0];
    if (!word) {
      return undefined;
    }
    tokens.push({ kind: "value", text: word, quoted: false });
    at += word.length;
  }
  return tokens;
}

/** Recursive descent: or → and → not → comparison | ( or ). Undefined is "not understood". */
class Parser {
  private at = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly lookup: (key: string) => unknown,
  ) {}

  done(): boolean {
    return this.at === this.tokens.length;
  }

  or(): boolean | undefined {
    let value = this.and();
    while (this.peek("||")) {
      this.at++;
      const right = this.and();
      value =
        value === undefined || right === undefined ? undefined : value || right;
    }
    return value;
  }

  private and(): boolean | undefined {
    let value = this.not();
    while (this.peek("&&")) {
      this.at++;
      const right = this.not();
      value =
        value === undefined || right === undefined ? undefined : value && right;
    }
    return value;
  }

  private not(): boolean | undefined {
    if (this.peek("!")) {
      this.at++;
      const value = this.not();
      return value === undefined ? undefined : !value;
    }
    if (this.peek("(")) {
      this.at++;
      const value = this.or();
      if (!this.peek(")")) {
        return undefined;
      }
      this.at++;
      return value;
    }
    return this.comparison();
  }

  private comparison(): boolean | undefined {
    const left = this.tokens[this.at];
    if (left?.kind !== "value") {
      return undefined;
    }
    this.at++;
    const value = left.quoted ? left.text : this.valueOf(left.text);
    const op = this.tokens[this.at];
    if (op?.kind === "op" && (op.text === "==" || op.text === "!=")) {
      const right = this.tokens[this.at + 1];
      if (right?.kind !== "value") {
        return undefined;
      }
      this.at += 2;
      const equal = String(value) === right.text;
      return op.text === "==" ? equal : !equal;
    }
    return Boolean(value);
  }

  private valueOf(key: string): unknown {
    if (key === "true" || key === "false") {
      return key === "true";
    }
    return this.lookup(key);
  }

  private peek(text: string): boolean {
    const token = this.tokens[this.at];
    return token?.kind === "op" && token.text === text;
  }
}
