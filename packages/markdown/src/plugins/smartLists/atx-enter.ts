import { EditorSelection } from "@codemirror/state";
import type { ChangeSpec, EditorState, Transaction } from "@codemirror/state";
import { continuationPrefix } from "../../markdown/list-markup";
import { exitAtxHeadingMidOpener } from "./atx-mid-enter";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote, optional list/task, then ATX with required space/tab
 * (same opener as BH-061–063 unwrap). Regex-first: task lines with `# `
 * often parse as Task, not ATXHeading.
 */
const prefixedAtx =
  /^((?:[ \t]*>[ \t]?)*)((?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[^\]\n]\][ \t]+)?)?)( {0,3}#{1,6}[ \t]+)/u;

/**
 * Enter / Shift+Enter inside an ATX heading exits below the heading line
 * (BH-084 / setext BH-059 parity) instead of splitting the title into an empty
 * `# ` line plus a continued quote/list (`> # |Title` → `> # \n> |Title`).
 *
 * Empty ATX (`# |`, `> # |`, `- # |`) unwraps the marker (ATX Backspace
 * parity) so Enter does not leave a blank heading.
 *
 * Shift+Enter lines up with list text via continuation indent; Enter keeps
 * quote + list/task markers on the new line (smart-list continue).
 */
export function exitAtxHeading(target: Target, soft: boolean): boolean {
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
  const contentStart = line.from + keep.length + atx.length;
  if (caret < contentStart) {
    return exitAtxHeadingMidOpener(target, soft);
  }
  const body = line.text.slice(keep.length + atx.length);
  // Empty heading: unwrap marker (BH-061 sibling on Enter/SE).
  if (body.trim() === "") {
    const markerFrom = line.from + keep.length;
    const markerTo = markerFrom + atx.length;
    target.dispatch(
      state.update({
        changes: { from: markerFrom, to: markerTo, insert: "" },
        selection: EditorSelection.cursor(markerFrom),
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  }
  // Content start: leave title intact and exit below (BH-082 setext parity).
  const suffix = caret > contentStart ? line.text.slice(caret - line.from) : "";
  const below = soft ? continuationPrefix(line.text) : keep;
  const insert = state.lineBreak + below + suffix;
  const changes: ChangeSpec[] =
    suffix.length > 0
      ? [
          { from: caret, to: line.to, insert: "" },
          { from: line.to, insert },
        ]
      : [{ from: line.to, insert }];
  const set = state.changes(changes);
  const cursor = set.mapPos(line.to, 1) - suffix.length;
  target.dispatch(
    state.update({
      changes: set,
      selection: EditorSelection.cursor(cursor),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}
