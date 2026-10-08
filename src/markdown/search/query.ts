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
  switch (term.kind) {
    case "scope":
      return (
        term.scope === "file" ||
        term.scope === "path" ||
        searchesFiles(term.term)
      );
    case "and":
    case "or":
      return term.terms.some(searchesFiles);
    case "not":
      return searchesFiles(term.term);
    default:
      return false;
  }
}

/** Parse query syntax separately from document evaluation and result rendering. */
export function parseSearch(source: string): SearchQuery {
  return new SearchParser(source).parse();
}

class SearchParser {
  private at = 0;
  constructor(private readonly source: string) {}

  parse(): SearchQuery {
    this.space();
    if (this.at === this.source.length) {
      return this.fail("Search query is empty");
    }
    const result = this.expression("", true);
    this.space();
    if (this.at !== this.source.length) {
      return this.fail("Unexpected query character");
    }
    return result;
  }
  private fail(message: string): never {
    throw new Error(`${message} at character ${this.at + 1}.`);
  }
  private space(): void {
    while (
      /\s/.test(this.source[this.at] ?? "") &&
      this.at < this.source.length
    ) {
      this.at++;
    }
  }
  private or(): boolean {
    return (
      this.source.slice(this.at, this.at + 2) === "OR" &&
      (this.at + 2 === this.source.length ||
        /[\s()[\]]/.test(this.source[this.at + 2]!))
    );
  }
  private quoted(): string {
    this.at++;
    let text = "";
    while (this.at < this.source.length) {
      const char = this.source[this.at++]!;
      if (char === '"') {
        return text;
      }
      if (
        char === "\\" &&
        (this.source[this.at] === '"' || this.source[this.at] === "\\")
      ) {
        text += this.source[this.at++]!;
      } else {
        text += char;
      }
    }
    return this.fail("Unclosed quoted phrase");
  }
  private regex(): SearchQuery {
    this.at++;
    let pattern = "";
    let bracket = false;
    while (this.at < this.source.length) {
      const char = this.source[this.at++]!;
      if (char === "\\" && this.at < this.source.length) {
        pattern += char + this.source[this.at++]!;
        continue;
      }
      if (char === "[") {
        bracket = true;
      }
      if (char === "]") {
        bracket = false;
      }
      if (char === "/" && !bracket) {
        const flags = /^[imsu]*/.exec(this.source.slice(this.at))![0];
        this.at += flags.length;
        try {
          new RegExp(pattern, flags);
        } catch {
          return this.fail("Invalid regular expression");
        }
        return { kind: "regex", value: pattern, flags };
      }
      pattern += char;
    }
    return this.fail("Unclosed regular expression");
  }
  private expression(
    stops: string,
    scopes: boolean,
    propertyValue = false,
  ): SearchQuery {
    const alternatives: SearchQuery[] = [];
    while (true) {
      const terms: SearchQuery[] = [];
      this.space();
      while (
        this.at < this.source.length &&
        !stops.includes(this.source[this.at]!) &&
        !this.or()
      ) {
        terms.push(this.unary(stops, scopes, propertyValue));
        this.space();
      }
      if (!terms.length) {
        return this.fail("Expected a search term");
      }
      alternatives.push(
        terms.length === 1 ? terms[0]! : { kind: "and", terms },
      );
      if (!this.or()) {
        break;
      }
      this.at += 2;
      this.space();
    }
    return alternatives.length === 1
      ? alternatives[0]!
      : { kind: "or", terms: alternatives };
  }
  private unary(
    stops: string,
    scopes: boolean,
    propertyValue: boolean,
  ): SearchQuery {
    this.space();
    if (
      this.source[this.at] === "-" &&
      !(propertyValue && /^-\d/.test(this.source.slice(this.at)))
    ) {
      this.at++;
      return { kind: "not", term: this.unary(stops, scopes, propertyValue) };
    }
    if (this.source[this.at] === "(") {
      return this.group(scopes, propertyValue);
    }
    if (this.source[this.at] === "[" && scopes) {
      return this.property();
    }
    if (scopes) {
      const operator = /^([a-z-]+):/.exec(this.source.slice(this.at));
      if (operator) {
        this.at += operator[0].length;
        if (!searchScopes.has(operator[1]!)) {
          return this.fail(`Unsupported search operator ${operator[1]}`);
        }
        return {
          kind: "scope",
          scope: operator[1]!,
          term: this.unary(stops, scopes, propertyValue),
        };
      }
    }
    if (this.source[this.at] === '"') {
      return { kind: "text", value: this.quoted() };
    }
    if (this.source[this.at] === "/") {
      return this.regex();
    }
    return this.unquoted(stops);
  }

  private unquoted(stops: string): SearchQuery {
    const start = this.at;
    while (
      this.at < this.source.length &&
      !/\s|[()[\]]/.test(this.source[this.at]!) &&
      !stops.includes(this.source[this.at]!)
    ) {
      this.at++;
    }
    if (this.at === start) {
      return this.fail("Expected a search term");
    }
    return { kind: "text", value: this.source.slice(start, this.at) };
  }
  private group(scopes: boolean, propertyValue: boolean): SearchQuery {
    this.at++;
    const result = this.expression(")", scopes, propertyValue);
    if (this.source[this.at] !== ")") {
      return this.fail("Unclosed group");
    }
    this.at++;
    return result;
  }

  private property(): SearchQuery {
    this.at++;
    const name = this.expression(":]", false);
    let value: SearchQuery | undefined;
    if (this.source[this.at] === ":") {
      this.at++;
      value = this.expression("]", false, true);
    }
    if (this.source[this.at] !== "]") {
      return this.fail("Unclosed property filter");
    }
    this.at++;
    return value
      ? { kind: "property", name, value }
      : { kind: "property", name };
  }
}
