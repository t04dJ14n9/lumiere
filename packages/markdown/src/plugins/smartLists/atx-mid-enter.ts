import { EditorSelection } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";
import { continuationPrefix } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote, optional list/task, then ATX with required space/tab
 * (same opener shape as BH-061–063 / BH-084).
 */
const prefixedAtx =
  /^((?:[ \t]*>[ \t]?)*)((?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[^\]\n]\][ \t]+)?)?)( {0,3}#{1,6}[ \t]+)/u;

/**
 * Enter / Shift+Enter with the caret inside the ATX opener (`#| Title`,
 * `##| Hello`) must not split the marker (`#\n| Title`). Exit below the
 * heading with the title intact (BH-098 / content-start BH-084 sibling).
 *
 * Only claims mid-opener carets (`atxFrom ≤ caret < contentStart`). Content
 * start / empty unwrap remain BH-084 (#366).
 */
export function exitAtxHeadingMidOpener(
  target: Target,
  soft: boolean,
): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const caret = range.head;
  const line = state.doc.lineAt(caret);
  const match = prefixedAtx.exec(line.text);
  if (!match) {
    return false;
  }
  const keep = (match[1] ?? "") + (match[2] ?? "");
  const atx = match[3] ?? "";
  const atxFrom = line.from + keep.length;
  const contentStart = atxFrom + atx.length;
  if (caret < atxFrom || caret >= contentStart) {
    return false;
  }
  const below = soft ? continuationPrefix(line.text) : keep;
  const insert = state.lineBreak + below;
  target.dispatch(
    state.update({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(line.to + insert.length),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}
