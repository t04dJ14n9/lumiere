import {
  Language,
  LanguageSupport,
  defineLanguageFacet,
  languageDataProp,
} from "@codemirror/language";
import type { Text } from "@codemirror/state";
import type { Tree, TreeFragment } from "@lezer/common";
import { parser, GFM } from "@lezer/markdown";
import { frontmatter } from "./frontmatter";
import { math } from "./math";
import { tags } from "./tags";
import { footnotes } from "./footnotes";
import { wiki } from "./wiki";
import { highlight } from "./highlight";
import { comments } from "./comments";
const data = defineLanguageFacet({ commentTokens: { block: { open: "%%", close: "%%" } } });
export const markdownParser = parser.configure([
  GFM,
  frontmatter,
  math,
  tags,
  footnotes,
  wiki,
  highlight,
  comments,
  { props: [languageDataProp.add({ Document: data })] },
]);
const language = new Language(data, markdownParser, [], "markdown");
export function markdownLanguageSupport(): LanguageSupport {
  return new LanguageSupport(language);
}
const trees = new WeakMap<Text, Tree>();
export function parseMarkdown(doc: Text, fragments: readonly TreeFragment[] = []): Tree {
  let tree = trees.get(doc);
  if (!tree) {
    tree = markdownParser.parse(doc.toString(), fragments);
    trees.set(doc, tree);
  }
  return tree;
}
export const parseCached = parseMarkdown;
