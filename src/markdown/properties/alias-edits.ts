import { isAlias, isNode, stringify, visit, type Document } from "yaml";
import type { headerParts } from "./frontmatter";
import { setPropertyChange, type PropertyChange } from "./yaml-value";

/** Alias sites are mid-line; keep inserts indentation-independent. */
function inlineYamlValue(value: unknown): string {
  // Quote strings as JSON to avoid multiline inserts at nested alias sites,
  // while YAML serialization preserves non-finite numbers in collections too.
  return stringify(value, {
    collectionStyle: "flow",
    flowCollectionPadding: false,
    lineWidth: 0,
    aliasDuplicateObjects: false,
    defaultKeyType: "PLAIN",
    defaultStringType: "QUOTE_DOUBLE",
    doubleQuotedAsJSON: true,
  }).trimEnd();
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
  targets: Map<Anchored, string>,
): void {
  if (!anchored.anchor || !anchored.range) {
    return;
  }
  targets.set(
    anchored,
    inlineYamlValue(anchored.toJS(document, { maxAliasCount: 100 })),
  );
}

function anchoredTargets(
  document: Document,
  node: Anchored,
): Map<Anchored, string> {
  const targets = new Map<Anchored, string>();
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
  if (!targets.size) {
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
      const resolved = alias.resolve(document);
      const insert = resolved && targets.get(resolved);
      if (insert !== undefined) {
        changes.push(aliasReplacement(source, header, alias.range, insert));
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
