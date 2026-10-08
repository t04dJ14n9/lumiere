import { markdownParser as language } from "../dialect";
import { parseDocument } from "yaml";

import { noteTags } from "../metadata/tags";
import { taskMarker } from "../tasks";
import { canvasData } from "./canvas";
import { parseSearch, searchesFiles, type SearchQuery } from "./query";
import { SearchComparison, type SearchContext } from "./compare";

export interface SearchDocument {
  path: string;
  text: string;
  kind?: "markdown" | "canvas" | "file";
  metadata?: { tags: string[]; properties: Record<string, unknown> };
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
  const comparison = new SearchComparison();
  const includesFiles = searchesFiles(query);
  return (document) => {
    const search = new DocumentSearch(document, comparison);
    if (search.kind === "file" && !includesFiles) {
      return false;
    }
    return search.evaluate(query, {
      text: () => search.content(),
      sensitive: false,
      allowed: search.kind !== "file",
    });
  };
}

/** Scope evaluation owns only one document's lazy content and metadata caches. */
class DocumentSearch {
  readonly kind: NonNullable<SearchDocument["kind"]>;
  private text: string;
  private prepared: boolean;
  private tags?: string[];
  private metadata?: Record<string, unknown>;
  private readonly structure = new Map<string, Regions>();

  constructor(
    private readonly document: SearchDocument,
    private readonly comparison: SearchComparison,
  ) {
    this.kind = document.kind ?? documentKind(document.path);
    this.text = document.text;
    this.tags = document.metadata?.tags;
    this.metadata = document.metadata?.properties;
    this.prepared = this.kind !== "canvas";
  }

  content(): string {
    if (!this.prepared) {
      const canvas = canvasData(this.text);
      this.text = [
        ...canvas.nodes.map(
          (node) => node.text ?? node.label ?? node.url ?? node.file ?? "",
        ),
        ...canvas.edges.map((edge) => edge.label ?? ""),
      ].join("\n");
      this.prepared = true;
    }
    return this.text;
  }

  evaluate(term: SearchQuery, context: SearchContext): boolean {
    switch (term.kind) {
      case "and":
        return term.terms.every((child) => this.evaluate(child, context));
      case "or":
        return term.terms.some((child) => this.evaluate(child, context));
      case "not":
        return !this.evaluate(term.term, context);
      case "text":
      case "regex":
        return (
          context.allowed &&
          (context.values ?? [context.text()]).some((value) =>
            this.comparison.matches(term, value, context),
          )
        );
      case "property":
        return this.evaluateProperty(term, context);
      case "scope":
        return this.evaluateScope(term, context);
    }
  }

  private evaluateProperty(
    term: Extract<SearchQuery, { kind: "property" }>,
    context: SearchContext,
  ): boolean {
    if (this.kind !== "markdown") {
      return false;
    }
    this.metadata ??= properties(this.document.text);
    return Object.entries(this.metadata).some(
      ([name, value]) =>
        this.evaluate(term.name, {
          ...context,
          allowed: true,
          mode: "name",
          values: [name],
        }) &&
        (!term.value ||
          this.evaluate(term.value, {
            ...context,
            allowed: true,
            mode: "property",
            values: [value],
          })),
    );
  }

  private evaluateScope(
    term: Extract<SearchQuery, { kind: "scope" }>,
    context: SearchContext,
  ): boolean {
    const plain = { ...context, mode: undefined, values: undefined };
    if (term.scope === "match-case" || term.scope === "ignore-case") {
      return this.evaluate(term.term, {
        ...context,
        sensitive: term.scope === "match-case",
      });
    }
    if (term.scope === "file" || term.scope === "path") {
      return this.evaluate(term.term, {
        ...plain,
        allowed: true,
        text: () =>
          term.scope === "file"
            ? this.document.path.split("/").at(-1)!
            : this.document.path,
      });
    }
    if (term.scope === "content") {
      return this.evaluate(term.term, plain);
    }
    if (term.scope === "tag") {
      return this.evaluateTags(term.term, context);
    }
    if (!context.allowed) {
      return false;
    }
    if (term.scope === "line") {
      return context
        .text()
        .split(/\r?\n/)
        .some((line) =>
          this.evaluate(term.term, { ...plain, text: () => line }),
        );
    }
    return this.evaluateRegion(term, plain);
  }

  private evaluateTags(term: SearchQuery, context: SearchContext): boolean {
    if (this.kind !== "markdown") {
      return false;
    }
    this.tags ??= noteTags(this.document.text);
    return this.evaluate(term, {
      ...context,
      allowed: true,
      sensitive: false,
      mode: "tag",
      values: this.tags,
    });
  }

  private evaluateRegion(
    term: Extract<SearchQuery, { kind: "scope" }>,
    context: SearchContext,
  ): boolean {
    if (this.kind !== "markdown") {
      return false;
    }
    let scopes = this.structure.get(context.text());
    if (!scopes) {
      scopes = regions(context.text());
      this.structure.set(context.text(), scopes);
    }
    if (!(term.scope in scopes)) {
      throw new Error(`Unsupported search operator ${term.scope}.`);
    }
    return scopes[term.scope as keyof Regions].some((block) =>
      this.evaluate(term.term, { ...context, text: () => block }),
    );
  }
}

export function documentKind(
  path: string,
): NonNullable<SearchDocument["kind"]> {
  if (/\.(md|markdown)$/i.test(path)) {
    return "markdown";
  }
  return /\.canvas$/i.test(path) ? "canvas" : "file";
}
