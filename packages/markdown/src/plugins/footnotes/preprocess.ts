import { Text } from "@codemirror/state";
import { markdownParser } from "../../markdown/dialect";
import { footnotes, type Footnote } from "../../markdown/metadata/footnotes";

export interface FootnoteReplacement {
  from: number;
  to: number;
  id: string;
  note: Footnote;
}

/** Resolve against the owning note, then substitute opaque placeholders before HTML rendering. */
export function prepareFootnotes(
  source: string,
  document: Text,
  sourceLine: number,
  nonce: string,
) {
  if (!source.includes("[^") && !source.includes("^[")) {
    return { replacements: [], displaySource: source };
  }
  const registry = footnotes(document);
  let local: ReturnType<typeof footnotes> | undefined;
  const base = document.line(Math.min(document.lines, sourceLine + 1)).from;
  const replacements: FootnoteReplacement[] = [];
  markdownParser.parse(source).iterate({
    enter(node) {
      if (node.name !== "FootnoteRef" && node.name !== "InlineFootnote") {
        return;
      }
      const label = source.slice(node.from + 2, node.to - 1);
      const note =
        node.name === "FootnoteRef"
          ? registry.definitions.find((note) => note.label === label)
          : (registry.references.get(base + node.from) ??
            (local ??= footnotes(Text.of(source.split("\n")))).references.get(
              node.from,
            ));
      if (!note) {
        return false;
      }
      const id = `fn-${nonce}-${replacements.length}`;
      replacements.push({ from: node.from, to: node.to, id, note });
      return false;
    },
  });
  let displaySource = source;
  for (const replacement of [...replacements].reverse()) {
    displaySource =
      displaySource.slice(0, replacement.from) +
      `<sup data-mw-footnote="${replacement.id}"></sup>` +
      displaySource.slice(replacement.to);
  }
  return { replacements, displaySource };
}
