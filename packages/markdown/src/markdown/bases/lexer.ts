export type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "regexp"; pattern: string; flags: string }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string }
  | { kind: "punc"; value: string };

const TWO_CHAR_OPS: ReadonlySet<string> = new Set([
  "||",
  "&&",
  "==",
  "!=",
  "<=",
  ">=",
]);

const ONE_CHAR_OPS: ReadonlySet<string> = new Set([
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
]);

const PUNCS: ReadonlySet<string> = new Set(["(", ")", "[", "]", ",", "."]);

function canStartRegex(prev: Token | undefined): boolean {
  if (!prev) {
    return true;
  }
  if (prev.kind === "op") {
    return true;
  }
  if (prev.kind === "punc") {
    return prev.value === "(" || prev.value === "[" || prev.value === ",";
  }
  return false;
}

function unescapeChar(ch: string): string {
  if (ch === "n") {
    return "\n";
  }
  if (ch === "t") {
    return "\t";
  }
  return ch;
}

function readString(
  source: string,
  start: number,
): { token: Token; next: number } {
  const quote = source[start]!;
  let idx = start + 1;
  let out = "";
  while (idx < source.length && source[idx] !== quote) {
    if (source[idx] === "\\" && idx + 1 < source.length) {
      idx += 1;
      out += unescapeChar(source[idx]!);
    } else {
      out += source[idx]!;
    }
    idx += 1;
  }
  return {
    token: { kind: "string", value: out },
    next: Math.min(source.length, idx + 1),
  };
}

function tryReadRegex(
  source: string,
  start: number,
): { token: Token; next: number } | undefined {
  let idx = start + 1;
  let pattern = "";
  while (idx < source.length && source[idx] !== "/") {
    if (source[idx] === "\\" && idx + 1 < source.length) {
      pattern += source.slice(idx, idx + 2);
      idx += 2;
    } else {
      pattern += source[idx]!;
      idx += 1;
    }
  }
  if (idx >= source.length || source[idx] !== "/" || pattern.length === 0) {
    return undefined;
  }
  idx += 1;
  let flags = "";
  while (idx < source.length && /[gimsuy]/.test(source[idx]!)) {
    flags += source[idx]!;
    idx += 1;
  }
  return { token: { kind: "regexp", pattern, flags }, next: idx };
}

function readNumber(
  source: string,
  start: number,
): { token: Token; next: number } {
  let idx = start;
  while (idx < source.length && /[\d.]/.test(source[idx]!)) {
    idx += 1;
  }
  const value = Number(source.slice(start, idx));
  return {
    token: { kind: "number", value: Number.isFinite(value) ? value : 0 },
    next: idx,
  };
}

function readIdent(
  source: string,
  start: number,
): { token: Token; next: number } {
  let idx = start;
  while (idx < source.length && /[\p{L}\p{N}_$-]/u.test(source[idx]!)) {
    idx += 1;
  }
  return {
    token: { kind: "ident", value: source.slice(start, idx) },
    next: idx,
  };
}

function nextToken(
  source: string,
  idx: number,
  prev: Token | undefined,
): { token: Token; next: number } | undefined {
  const ch = source[idx]!;
  if (ch === '"' || ch === "'") {
    return readString(source, idx);
  }
  if (ch === "/" && canStartRegex(prev)) {
    const regex = tryReadRegex(source, idx);
    if (regex) {
      return regex;
    }
  }
  if (/\d/.test(ch)) {
    return readNumber(source, idx);
  }
  const two = source.slice(idx, idx + 2);
  if (TWO_CHAR_OPS.has(two)) {
    return { token: { kind: "op", value: two }, next: idx + 2 };
  }
  if (ONE_CHAR_OPS.has(ch)) {
    return { token: { kind: "op", value: ch }, next: idx + 1 };
  }
  if (PUNCS.has(ch)) {
    return { token: { kind: "punc", value: ch }, next: idx + 1 };
  }
  if (/[\p{L}_$]/u.test(ch)) {
    return readIdent(source, idx);
  }
  return undefined;
}

export function tokenizeExpr(source: string): Token[] {
  const tokens: Token[] = [];
  let idx = 0;
  while (idx < source.length) {
    if (/\s/.test(source[idx]!)) {
      idx += 1;
      continue;
    }
    const prev = tokens[tokens.length - 1];
    const step = nextToken(source, idx, prev);
    if (!step) {
      idx += 1;
      continue;
    }
    tokens.push(step.token);
    idx = step.next;
  }
  return tokens;
}
