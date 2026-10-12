import type { EditorView } from "@codemirror/view";
import { markdownParser } from "../../markdown/dialect";

export function linkAt(
  text: string,
  at: number,
): { href: string; wiki: boolean } | undefined {
  let found: { href: string; wiki: boolean } | undefined;
  markdownParser.parse(text).iterate({
    enter(node) {
      if (node.from > at || node.to < at) {
        return false;
      }
      if (node.name === "Image") {
        return false;
      }
      if (node.name === "WikiLink") {
        found = {
          href: text.slice(node.from + 2, node.to - 2).split("|")[0]!,
          wiki: true,
        };
      }
      if (node.name === "URL" && !found) {
        found = { href: text.slice(node.from, node.to), wiki: false };
      }
      if (node.name === "Link") {
        const url = node.node.getChild("URL");
        if (url) {
          found = { href: text.slice(url.from, url.to), wiki: false };
        }
      }
      return undefined;
    },
  });
  return found;
}
export function followCaretLink(
  view: EditorView,
  open: (href: string, wiki: boolean) => Promise<boolean>,
  report: (error: unknown) => void,
): boolean {
  // Each editor owns its caret: prompts, property inputs and another editor
  // must not follow the outer caret's link. Enter also commits IME composition.
  if (
    view.dom.ownerDocument.activeElement !== view.contentDOM ||
    view.composing ||
    !view.state.selection.main.empty
  ) {
    return false;
  }
  const link = linkAt(
    view.state.doc.toString(),
    view.state.selection.main.head,
  );
  if (!link) {
    return false;
  }
  void open(link.href, link.wiki).catch(report);
  return true;
}
