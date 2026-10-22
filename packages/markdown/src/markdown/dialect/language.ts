import {
  Language,
  LanguageSupport,
  indentNodeProp,
  languageDataProp,
} from "@codemirror/language";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { markdownParser } from "./parser";

// Share lang-markdown's language data facet so its commands (list and
// quote continuation, markup deletion) recognise this dialect as Markdown.
const data = markdownLanguage.data;

const editorParser = markdownParser.configure([
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

const language = new Language(data, editorParser, [], "markdown");

export function markdownLanguageSupport(): LanguageSupport {
  return new LanguageSupport(language, [
    // Listed before lang-markdown's HTML comment tokens, so it wins.
    data.of({ commentTokens: { block: { open: "%%", close: "%%" } } }),
  ]);
}
