export type SearchQuery =
  | { kind: "text"; value: string }
  | { kind: "regex"; value: string; flags: string }
  | { kind: "and" | "or"; terms: SearchQuery[] }
  | { kind: "not"; term: SearchQuery }
  | { kind: "scope"; scope: string; term: SearchQuery }
  | { kind: "property"; name: SearchQuery; value?: SearchQuery };

export const searchScopes = new Set([
  "file",
  "path",
  "content",
  "tag",
  "match-case",
  "ignore-case",
  "line",
  "block",
  "section",
  "task",
  "task-todo",
  "task-done",
]);
export function searchesFiles(term: SearchQuery): boolean {
  return term.kind === "scope"
    ? term.scope === "file" || term.scope === "path" || searchesFiles(term.term)
    : term.kind === "and" || term.kind === "or"
      ? term.terms.some(searchesFiles)
      : term.kind === "not"
        ? searchesFiles(term.term)
        : false;
}

/** Parse query syntax separately from document evaluation and result rendering. */
export function parseSearch(source: string): SearchQuery {
  let at = 0;
  const fail = (message: string): never => {
    throw new Error(`${message} at character ${at + 1}.`);
  };
  const space = (): void => {
    while (/\s/.test(source[at] ?? "") && at < source.length) {
      at++;
    }
  };
  const or = (): boolean =>
    source.slice(at, at + 2) === "OR" &&
    (at + 2 === source.length || /[\s()[\]]/.test(source[at + 2]!));
  const quoted = (): string => {
    at++;
    let text = "";
    while (at < source.length) {
      const char = source[at++]!;
      if (char === '"') {
        return text;
      }
      if (char === "\\" && (source[at] === '"' || source[at] === "\\")) {
        text += source[at++]!;
      } else {
        text += char;
      }
    }
    return fail("Unclosed quoted phrase");
  };
  const regex = (): SearchQuery => {
    at++;
    let pattern = "",
      bracket = false;
    while (at < source.length) {
      const char = source[at++]!;
      if (char === "\\" && at < source.length) {
        pattern += char + source[at++]!;
        continue;
      }
      if (char === "[") {
        bracket = true;
      }
      if (char === "]") {
        bracket = false;
      }
      if (char === "/" && !bracket) {
        const flags = /^[imsu]*/.exec(source.slice(at))![0];
        at += flags.length;
        try {
          new RegExp(pattern, flags);
        } catch {
          return fail("Invalid regular expression");
        }
        return { kind: "regex", value: pattern, flags };
      }
      pattern += char;
    }
    return fail("Unclosed regular expression");
  };
  const expression = (stops: string, scopes: boolean, propertyValue = false): SearchQuery => {
    const alternatives: SearchQuery[] = [];
    while (true) {
      const terms: SearchQuery[] = [];
      space();
      while (at < source.length && !stops.includes(source[at]!) && !or()) {
        terms.push(unary(stops, scopes, propertyValue));
        space();
      }
      if (!terms.length) {
        return fail("Expected a search term");
      }
      alternatives.push(terms.length === 1 ? terms[0]! : { kind: "and", terms });
      if (!or()) {
        break;
      }
      at += 2;
      space();
    }
    return alternatives.length === 1 ? alternatives[0]! : { kind: "or", terms: alternatives };
  };
  const unary = (stops: string, scopes: boolean, propertyValue: boolean): SearchQuery => {
    space();
    if (source[at] === "-" && !(propertyValue && /^-\d/.test(source.slice(at)))) {
      at++;
      return { kind: "not", term: unary(stops, scopes, propertyValue) };
    }
    if (source[at] === "(") {
      at++;
      const result = expression(")", scopes, propertyValue);
      if (source[at] !== ")") {
        return fail("Unclosed group");
      }
      at++;
      return result;
    }
    if (source[at] === "[" && scopes) {
      at++;
      const name = expression(":]", false);
      let value: SearchQuery | undefined;
      if (source[at] === ":") {
        at++;
        value = expression("]", false, true);
      }
      if (source[at] !== "]") {
        return fail("Unclosed property filter");
      }
      at++;
      return value ? { kind: "property", name, value } : { kind: "property", name };
    }
    if (scopes) {
      const operator = /^([a-z-]+):/.exec(source.slice(at));
      if (operator) {
        at += operator[0].length;
        if (!searchScopes.has(operator[1]!)) {
          return fail(`Unsupported search operator ${operator[1]}`);
        }
        return {
          kind: "scope",
          scope: operator[1]!,
          term: unary(stops, scopes, propertyValue),
        };
      }
    }
    if (source[at] === '"') {
      return { kind: "text", value: quoted() };
    }
    if (source[at] === "/") {
      return regex();
    }
    const start = at;
    while (at < source.length && !/\s|[()[\]]/.test(source[at]!) && !stops.includes(source[at]!)) {
      at++;
    }
    if (at === start) {
      return fail("Expected a search term");
    }
    return { kind: "text", value: source.slice(start, at) };
  };
  space();
  if (at === source.length) {
    return fail("Search query is empty");
  }
  const result = expression("", true);
  space();
  if (at !== source.length) {
    return fail("Unexpected query character");
  }
  return result;
}
