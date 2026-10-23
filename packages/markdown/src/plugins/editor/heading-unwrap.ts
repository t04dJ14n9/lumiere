import type { EditorState, Transaction } from "@codemirror/state";
import { lineMarkup } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote prefix, then ATX marker with the required space/tab
 * (`# `, `##\t`, …). Up to three spaces before `#`, as CommonMark allows —
 * those spaces are part of the marker, not kept after unwrap (BH-062).
 */
const quotedAtx = /^((?:[ \t]*>[ \t]?)*)( {0,3}#{1,6}[ \t]+)/u;

/**
 * Backspace at ATX heading text start unwraps the marker (BH-061), including
 * under blockquotes (BH-062: `> # Title` → `> Title`). Leaves `#Heading`
 * (no space) alone — that is not an ATX heading. Keeps quote markers.
 */
export function unwrapAtxHeading(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = quotedAtx.exec(line.text);
  if (!match) {
    return false;
  }
  const quotes = match[1] ?? "";
  const marker = match[2] ?? "";
  const markerFrom = line.from + quotes.length;
  const markerTo = markerFrom + marker.length;
  if (range.head !== markerTo) {
    return false;
  }
  target.dispatch(
    state.update({
      changes: { from: markerFrom, to: markerTo, insert: "" },
      selection: { anchor: markerFrom },
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
