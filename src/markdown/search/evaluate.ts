import { markdownParser as language } from "../dialect";
import { parseDocument } from "yaml";

import { noteTags } from "../metadata/tags";
import { tagMatches } from "../tags/grammar";
import { taskMarker } from "../tasks";
import { canvasData } from "./canvas";
import { parseSearch, searchesFiles, type SearchQuery } from "./query";

export interface SearchDocument {
  path: string;
  text: string;
  kind?: "markdown" | "canvas" | "file";
}
interface Context {
  text: () => string;
  sensitive: boolean;
  allowed: boolean;
  mode?: "tag" | "property" | "name";
  values?: unknown[];
}
interface Regions {
  block: string[];
  section: string[];
  task: string[];
  "task-todo": string[];
  "task-done": string[];
}

function regions(source: string): Regions {
  const result: Regions = {
    block: [],
    section: [],
    task: [],
    "task-todo": [],
    "task-done": [],
  };
  const headings: number[] = [];
  language.parse(source).iterate({
    enter(node) {
      if (/^(ATX|Setext)Heading[1-6]$/.test(node.name)) {
        headings.push(node.from);
      }
      if (
        [
          "Paragraph",
          "Task",
          "Table",
          "FencedCode",
          "CodeBlock",
          "HTMLBlock",
        ].includes(node.name) ||
        /Heading[1-6]$/.test(node.name)
      ) {
        result.block.push(source.slice(node.from, node.to));
      }
      if (node.name === "ListItem") {
        const firstLine = source.slice(node.from, node.to).split("\n")[0]!;
        const marker = taskMarker(firstLine);
        if (marker === undefined) {
          return;
        }
        const body =
          node.node.getChild("Task") ?? node.node.getChild("Paragraph");
        const text = source.slice(node.from, body?.to ?? node.to);
        result.task.push(text);
        result[firstLine[marker] === " " ? "task-todo" : "task-done"].push(
          text,
        );
      }
    },
  });
  const starts = [...new Set([0, ...headings])];
  starts.forEach((from, index) =>
    result.section.push(source.slice(from, starts[index + 1] ?? source.length)),
  );
  return result;
}
function properties(source: string): Record<string, unknown> {
  const header = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(
    source,
  );
  if (!header) {
    return {};
  }
  const document = parseDocument(header[1]!, { uniqueKeys: true });
  if (document.errors.length) {
    return {};
  }
  try {
    const value: unknown = document.toJS({ maxAliasCount: 100 });
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** User-supplied regex evaluation must run in a cancellable worker, not the host UI thread. */
export function compileSearch(
  source: string | SearchQuery,
): (document: SearchDocument) => boolean {
  const query = typeof source === "string" ? parseSearch(source) : source;
  const expressions = new WeakMap<SearchQuery, Map<string, RegExp>>();
  const includesFiles = searchesFiles(query);
  return (document) => {
    const kind =
      document.kind ??
      (/\.(md|markdown)$/i.test(document.path)
        ? "markdown"
        : /\.canvas$/i.test(document.path)
          ? "canvas"
          : "file");
    if (kind === "file" && !includesFiles) {
      return false;
    }
    let text = document.text;
    let prepared = kind !== "canvas";
    const content = (): string => {
      if (!prepared) {
        const canvas = canvasData(text);
        text = [
          ...canvas.nodes.map(
            (node) => node.text ?? node.label ?? node.url ?? node.file ?? "",
          ),
          ...canvas.edges.map((edge) => edge.label ?? ""),
        ].join("\n");
        prepared = true;
      }
      return text;
    };
    let tags: string[] | undefined;
    let metadata: Record<string, unknown> | undefined;
    const structure = new Map<string, Regions>();
    const compare = (
      term: Extract<SearchQuery, { kind: "text" | "regex" }>,
      value: unknown,
      context: Context,
      seen = new Set<unknown>(),
    ): boolean => {
      if (Array.isArray(value)) {
        if (seen.has(value)) {
          return false;
        }
        const path = new Set(seen).add(value);
        return value.some((item) => compare(term, item, context, path));
      }
      if (value !== null && typeof value === "object") {
        return false;
      }
      if (term.kind === "text" && context.mode === "property") {
        if (term.value === "null") {
          return value === null;
        }
        if (value === null) {
          return false;
        }
        const numeric =
          /^(<=|>=|<|>|=)([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)$/i.exec(
            term.value,
          );
        if (numeric) {
          if (typeof value !== "number") {
            return false;
          }
          const number = Number(numeric[2]);
          return numeric[1] === "<"
            ? value < number
            : numeric[1] === ">"
              ? value > number
              : numeric[1] === "<="
                ? value <= number
                : numeric[1] === ">="
                  ? value >= number
                  : value === number;
        }
      }
      const candidate =
        typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : "";
      if (term.kind === "regex") {
        const flags = [
          ...new Set(term.flags + (context.sensitive ? "" : "i")),
        ].join("");
        let cache = expressions.get(term);
        if (!cache) {
          cache = new Map();
          expressions.set(term, cache);
        }
        let expression = cache.get(flags);
        if (!expression) {
          expression = new RegExp(term.value, flags);
          cache.set(flags, expression);
        }
        return expression.test(candidate);
      }
      if (context.mode === "tag") {
        return tagMatches(candidate, term.value.replace(/^#/, ""));
      }
      const a = context.sensitive ? candidate : candidate.toLowerCase();
      const b = context.sensitive ? term.value : term.value.toLowerCase();
      return context.mode === "name" || context.mode === "property"
        ? a === b
        : a.includes(b);
    };
    const evaluate = (term: SearchQuery, context: Context): boolean => {
      switch (term.kind) {
        case "and":
          return term.terms.every((child) => evaluate(child, context));
        case "or":
          return term.terms.some((child) => evaluate(child, context));
        case "not":
          return !evaluate(term.term, context);
        case "text":
        case "regex":
          return (
            context.allowed &&
            (context.values ?? [context.text()]).some((value) =>
              compare(term, value, context),
            )
          );
        case "property": {
          if (kind !== "markdown") {
            return false;
          }
          metadata ??= properties(document.text);
          return Object.entries(metadata).some(
            ([name, value]) =>
              evaluate(term.name, {
                ...context,
                allowed: true,
                mode: "name",
                values: [name],
              }) &&
              (!term.value ||
                evaluate(term.value, {
                  ...context,
                  allowed: true,
                  mode: "property",
                  values: [value],
                })),
          );
        }
        case "scope": {
          const plain = { ...context, mode: undefined, values: undefined };
          if (term.scope === "match-case" || term.scope === "ignore-case") {
            return evaluate(term.term, {
              ...context,
              sensitive: term.scope === "match-case",
            });
          }
          if (term.scope === "file" || term.scope === "path") {
            return evaluate(term.term, {
              ...plain,
              allowed: true,
              text: () =>
                term.scope === "file"
                  ? document.path.split("/").at(-1)!
                  : document.path,
            });
          }
          if (term.scope === "content") {
            return evaluate(term.term, plain);
          }
          if (term.scope === "tag") {
            if (kind !== "markdown") {
              return false;
            }
            tags ??= noteTags(document.text);
            return evaluate(term.term, {
              ...context,
              allowed: true,
              sensitive: false,
              mode: "tag",
              values: tags,
            });
          }
          if (!context.allowed) {
            return false;
          }
          if (term.scope === "line") {
            return context
              .text()
              .split(/\r?\n/)
              .some((line) =>
                evaluate(term.term, { ...plain, text: () => line }),
              );
          }
          if (kind !== "markdown") {
            return false;
          }
          let scopes = structure.get(context.text());
          if (!scopes) {
            scopes = regions(context.text());
            structure.set(context.text(), scopes);
          }
          if (!(term.scope in scopes)) {
            throw new Error(`Unsupported search operator ${term.scope}.`);
          }
          return scopes[term.scope as keyof Regions].some((block) =>
            evaluate(term.term, { ...plain, text: () => block }),
          );
        }
      }
    };
    return evaluate(query, {
      text: content,
      sensitive: false,
      allowed: kind !== "file",
    });
  };
}
