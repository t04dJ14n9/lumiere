import { tagMatches } from "../tags/grammar";
import type { SearchQuery } from "./query";

export interface SearchContext {
  text(): string;
  sensitive: boolean;
  allowed: boolean;
  mode?: "tag" | "property" | "name";
  values?: unknown[];
  /**
   * The file's name, which a plain term also matches outside any operator,
   * as in Obsidian (`Alice` finds `people/Alice.md`; a folder is not matched).
   */
  fileName?: string;
}
type ValueQuery = Extract<SearchQuery, { kind: "text" | "regex" }>;

/** Regex compilation is shared across documents; array cycle guards are local to a value path. */
export class SearchComparison {
  private readonly expressions = new WeakMap<
    SearchQuery,
    Map<string, RegExp>
  >();

  matches(
    term: ValueQuery,
    value: unknown,
    context: SearchContext,
    seen = new Set<unknown>(),
  ): boolean {
    if (Array.isArray(value)) {
      if (seen.has(value)) {
        return false;
      }
      const path = new Set(seen).add(value);
      return value.some((item) => this.matches(term, item, context, path));
    }
    if (value !== null && typeof value === "object") {
      return false;
    }
    if (term.kind === "text" && context.mode === "property") {
      const comparison = compareProperty(term.value, value);
      if (comparison !== undefined) {
        return comparison;
      }
    }
    const candidate = scalarText(value);
    if (term.kind === "regex") {
      return this.expression(term, context.sensitive).test(candidate);
    }
    if (context.mode === "tag") {
      return tagMatches(candidate, term.value.replace(/^#/, ""));
    }
    const left = context.sensitive ? candidate : candidate.toLowerCase();
    const right = context.sensitive ? term.value : term.value.toLowerCase();
    return context.mode === "name" || context.mode === "property"
      ? left === right
      : left.includes(right);
  }

  private expression(
    term: Extract<SearchQuery, { kind: "regex" }>,
    sensitive: boolean,
  ): RegExp {
    const flags = [...new Set(term.flags + (sensitive ? "" : "i"))].join("");
    let cache = this.expressions.get(term);
    if (!cache) {
      cache = new Map();
      this.expressions.set(term, cache);
    }
    let expression = cache.get(flags);
    if (!expression) {
      expression = new RegExp(term.value, flags);
      cache.set(flags, expression);
    }
    return expression;
  }
}

function compareProperty(query: string, value: unknown): boolean | undefined {
  if (query === "null") {
    return value === null;
  }
  if (value === null) {
    return false;
  }
  const numeric =
    /^(<=|>=|<|>|=)([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)$/i.exec(query);
  if (!numeric) {
    return undefined;
  }
  if (typeof value !== "number") {
    return false;
  }
  const number = Number(numeric[2]);
  switch (numeric[1]) {
    case "<":
      return value < number;
    case ">":
      return value > number;
    case "<=":
      return value <= number;
    case ">=":
      return value >= number;
    default:
      return value === number;
  }
}

function scalarText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
