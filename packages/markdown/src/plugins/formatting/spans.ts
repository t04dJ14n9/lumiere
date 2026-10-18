import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import {
  highlightColourAt,
  type HighlightColour,
} from "../../markdown/dialect/highlight";

/** The syntax node each inline marker makes. */
export const MARKER_KINDS: Readonly<Record<string, string>> = {
  "**": "StrongEmphasis",
  "*": "Emphasis",
  "~~": "Strikethrough",
  "==": "Highlight",
  "`": "InlineCode",
  $: "InlineMath",
};

/** A formatted span: its range, its markers' lengths and a highlight's colour. */
export interface Span {
  from: number;
  to: number;
  /** The opening marker's length, a highlight's colour emoji included. */
  open: number;
  close: number;
  colour?: HighlightColour;
}

/** The text a span formats, between its markers. */
export function spanContent(span: Span): { from: number; to: number } {
  return { from: span.from + span.open, to: span.to - span.close };
}

/** The spans of `kind` that overlap `from`–`to`, in order. */
export function spansIn(
  state: EditorState,
  kind: string,
  from: number,
  to: number,
): Span[] {
  const marker = Object.keys(MARKER_KINDS).find(
    (key) => MARKER_KINDS[key] === kind,
  )!;
  const spans: Span[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (node.name !== kind || node.to <= from || node.from >= to) {
        return;
      }
      const colour =
        kind === "Highlight"
          ? highlightColourAt(state.sliceDoc(node.from + 2, node.from + 4))
          : undefined;
      spans.push({
        from: node.from,
        to: node.to,
        open: marker.length + (colour ? 2 : 0),
        close: marker.length,
        ...(colour && { colour }),
      });
    },
  });
  return spans;
}
