import type { EditorState, Transaction } from "@codemirror/state";
import { lineMarkup } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * ATX marker plus the required space/tab after it (`# `, `##\t`, …). Up to
 * three leading spaces, as CommonMark allows.
 */
const atxMarker = /^ {0,3}#{1,6}[ \t]+/u;

/**
 * Backspace at ATX heading text start unwraps the marker (BH-061), matching
 * list/quote unwrap (BH-053–056). Leaves `#Heading` (no space) alone — that
 * is not an ATX heading.
 */
export function unwrapAtxHeading(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = atxMarker.exec(line.text);
  if (!match) {
    return false;
  }
  if (range.head !== line.from + match[0].length) {
    return false;
  }
  target.dispatch(
    state.update({
      changes: {
        from: line.from,
        to: line.from + match[0].length,
        insert: "",
      },
      selection: { anchor: line.from },
      scrollIntoView: true,
      userEvent: "delete.heading",
    }),
  );
  return true;
}

/** Strip the list marker / task box; keep quotes and the item's text. */
export function unwrapListMarker(target: Target): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const { quotes, marker, task } = lineMarkup(line.text);
  if (marker === "" && task === "") {
    return false;
  }
  const from = line.from + quotes.length;
  const to = from + marker.length + task.length;
  target.dispatch(
    state.update({
      changes: { from, to, insert: "" },
      selection: { anchor: from },
      scrollIntoView: true,
      userEvent: "delete.list",
    }),
  );
  return true;
}
