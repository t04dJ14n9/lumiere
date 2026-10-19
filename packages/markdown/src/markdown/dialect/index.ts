import {
  Language,
  LanguageSupport,
  indentNodeProp,
  languageDataProp,
} from "@codemirror/language";
import { markdownLanguage } from "@codemirror/lang-markdown";
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
// Share lang-markdown's language data facet so its commands (list and
// quote continuation, markup deletion) recognise this dialect as Markdown.
const data = markdownLanguage.data;
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
  {
    props: [
      languageDataProp.add({ Document: data }),
      // No indentation of its own, as lang-markdown says: Enter then keeps
      // the line's indentation (in a code block too, as in Obsidian) rather
      // than going to column 0.
      indentNodeProp.add({ Document: () => null }),
    ],
  },
]);
const language = new Language(data, markdownParser, [], "markdown");
export function markdownLanguageSupport(): LanguageSupport {
  return new LanguageSupport(language, [
    // Listed before lang-markdown's HTML comment tokens, so it wins.
    data.of({ commentTokens: { block: { open: "%%", close: "%%" } } }),
  ]);
}
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
