import type { EditorState, Transaction } from "@codemirror/state";
import { lineMarkup } from "../../markdown/list-markup";
import { unwrapCalloutTitle } from "./callout-unwrap";
import { unwrapFootnoteDefinition } from "./footnote-unwrap";
import { unwrapLinkReferenceDefinition } from "./linkref-unwrap";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote markers, optional list/task marker, then ATX with the
 * required space/tab (`# `, `##\t`, …). Up to three spaces before `#` are
 * part of the ATX marker (CommonMark), not kept after unwrap (BH-061/062).
 * List/task stay (BH-063: `- # Title` → `- Title`).
 */
const prefixedAtx =
  /^((?:[ \t]*>[ \t]?)*)((?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[^\]\n]\][ \t]+)?)?)( {0,3}#{1,6}[ \t]+)/u;

/**
 * Backspace at ATX heading text start unwraps the marker (BH-061), including
 * under blockquotes (BH-062: `> # Title` → `> Title`) and after list / task
 * markers (BH-063: `- # Title` → `- Title`). Leaves `#Heading` (no space)
 * alone. Keeps quote and list/task prefixes.
 */
export function unwrapAtxHeading(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = prefixedAtx.exec(line.text);
  if (!match) {
    return false;
  }
  const keep = (match[1] ?? "") + (match[2] ?? "");
  const atx = match[3] ?? "";
  const markerFrom = line.from + keep.length;
  const markerTo = markerFrom + atx.length;
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

/** ATX / callout / footnote-def / link-ref markers before textStart (BH-061–065, 071). */
export function unwrapLeadingMarkers(target: Target): boolean {
  return (
    unwrapAtxHeading(target) ||
    unwrapCalloutTitle(target) ||
    unwrapFootnoteDefinition(target) ||
    unwrapLinkReferenceDefinition(target)
  );
}
