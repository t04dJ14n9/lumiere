import type { Text } from "@codemirror/state";
import type { Tree, TreeFragment } from "@lezer/common";
import { parser, GFM } from "@lezer/markdown";
import { frontmatter } from "./frontmatter";
import { math } from "./math";
import { tags } from "./tags";
import { footnotes } from "./footnotes";
import { wiki } from "./wiki";
import { highlight } from "./highlight";
import { highlightEmphasis } from "./highlight-emphasis";
import { comments } from "./comments";
import { tasks } from "./tasks";
import { tableRows } from "./table-rows";

/**
 * Lezer Markdown dialect shared by the host, workers and webview. Editor-only
 * CodeMirror language props live in `language.ts` so the extension host never
 * loads `@codemirror/language` / `@codemirror/view` for vault indexing.
 */
export const markdownParser = parser.configure([
  GFM,
  tableRows,
  tasks,
  frontmatter,
  math,
  tags,
  footnotes,
  wiki,
  highlight,
  highlightEmphasis,
  comments,
]);

const trees = new WeakMap<Text, Tree>();

export function parseMarkdown(
  doc: Text,
  fragments: readonly TreeFragment[] = [],
): Tree {
  let tree = trees.get(doc);
  if (!tree) {
    tree = markdownParser.parse(doc.toString(), fragments);
    trees.set(doc, tree);
  }
  return tree;
}

/** The tree `parseMarkdown` already made for `doc`, without parsing. */
export function cachedMarkdown(doc: Text): Tree | undefined {
  return trees.get(doc);
}

export function rememberParsedMarkdown(doc: Text, tree: Tree): Tree {
  trees.set(doc, tree);
  return tree;
}
