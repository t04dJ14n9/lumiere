import { isAlias, isNode, visit, type Document } from "yaml";
import type { headerParts } from "./frontmatter";
import {
  setPropertyChange,
  yamlValue,
  type PropertyChange,
} from "./yaml-value";

/** Alias sites are mid-line; multiline plain scalars would break indentation. */
function inlineYamlValue(value: unknown): string {
  return typeof value === "string" && /[\r\n]/.test(value)
    ? JSON.stringify(value)
    : yamlValue(value);
}

type Header = NonNullable<ReturnType<typeof headerParts>>;

type Anchored = {
  anchor?: string | null;
  range?: [number, number, number] | null;
  toJS: (doc: Document, opts: { maxAliasCount: number }) => unknown;
};

function rememberAnchored(
  document: Document,
  anchored: Anchored,
  targets: Array<{ node: Anchored; insert: string }>,
): void {
  if (!anchored.anchor || !anchored.range) {
    return;
  }
  targets.push({
    node: anchored,
    insert: inlineYamlValue(anchored.toJS(document, { maxAliasCount: 100 })),
  });
}

function anchoredTargets(
  document: Document,
  node: Anchored,
): Array<{ node: Anchored; insert: string }> {
  const targets: Array<{ node: Anchored; insert: string }> = [];
  rememberAnchored(document, node, targets);
  visit(node as never, {
    Node(_key, child) {
      if (child !== node && isNode(child)) {
        rememberAnchored(document, child as Anchored, targets);
      }
    },
  });
  return targets;
}

function aliasReplacement(
  source: string,
  header: Header,
  range: [number, number, number],
  insert: string,
): PropertyChange {
  let text = insert;
  const from = header.offset + range[0];
  const to = header.offset + range[1];
  if (source[from - 1] === ":") {
    text = ` ${text}`;
  }
  if (source.slice(from, to).endsWith("\n")) {
    text += header.eol;
  }
  return { from, to, insert: text };
}

/** Inline resolved prior values at external aliases of a replaced subtree. */
export function aliasPreservationChanges(
  source: string,
  header: Header,
  document: Document,
  node: unknown,
): PropertyChange[] {
  if (!isNode(node) || !node.range) {
    return [];
  }
  const targets = anchoredTargets(document, node as Anchored);
  if (!targets.length) {
    return [];
  }
  const replaced = node.range;
  const changes: PropertyChange[] = [];
  visit(document, {
    Alias(_key, alias) {
      if (!isAlias(alias) || !alias.range) {
        return;
      }
      if (alias.range[0] >= replaced[0] && alias.range[1] <= replaced[1]) {
        return;
      }
      const target = targets.find(
        (entry) => alias.resolve(document) === entry.node,
      );
      if (target) {
        changes.push(
          aliasReplacement(source, header, alias.range, target.insert),
        );
      }
    },
  });
  return changes;
}

/** Minimally scoped set plus alias preservation for callers (set and merge). */
export function setPropertyChanges(options: {
  source: string;
  header: Header;
  document: Document;
  node: unknown;
  value: unknown;
}): PropertyChange[] | undefined {
  const { source, header, document, node, value } = options;
  const change = setPropertyChange(source, header, node, value);
  return change
    ? [change, ...aliasPreservationChanges(source, header, document, node)]
    : undefined;
}
