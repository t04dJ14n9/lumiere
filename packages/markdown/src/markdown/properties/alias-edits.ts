import {
  isAlias,
  isNode,
  parseDocument,
  stringify,
  visit,
  type Document,
  type Node,
} from "yaml";
import type { headerParts } from "./frontmatter";
import { setPropertyChange, type PropertyChange } from "./yaml-value";
import { setPropertyYamlChange } from "./yaml-source-edit";
import { settablePropertyNode } from "./values";

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

function anchoredTargets(body: string, node: Node): Map<Node, string> {
  const originals = new Map<number, Node>();
  visit(node, {
    Node(_key, child) {
      if (child.anchor && child.range) {
        originals.set(child.range[0], child);
      }
    },
  });
  const targets = new Map<Node, string>();
  if (!originals.size) {
    return targets;
  }
  // The caller's AST may already contain rounded Numbers. Reparse the source
  // with exact integers, including descendants and aliases to other subtrees.
  const exact = parseDocument(body, { intAsBigInt: true });
  visit(exact, {
    Scalar(_key, scalar) {
      // BigInt has no negative zero; YAML and Number retain its sign.
      if (scalar.value === 0n && scalar.source?.startsWith("-")) {
        scalar.value = -0;
      }
    },
  });
  visit(exact, {
    Node(_key, child) {
      const original =
        child.anchor && child.range && originals.get(child.range[0]);
      if (original) {
        targets.set(
          original,
          inlineYamlValue(child.toJS(exact, { maxAliasCount: 100 })),
        );
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
  const targets = anchoredTargets(header.body, node);
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
  yaml?: string | undefined;
}): PropertyChange[] | undefined {
  const { source, header, document, node, value, yaml } = options;
  if (!settablePropertyNode(node, document)) {
    return undefined;
  }
  const change =
    yaml === undefined
      ? setPropertyChange(source, header, node, value)
      : setPropertyYamlChange(source, header, node, yaml);
  return change
    ? [change, ...aliasPreservationChanges(source, header, document, node)]
    : undefined;
}
