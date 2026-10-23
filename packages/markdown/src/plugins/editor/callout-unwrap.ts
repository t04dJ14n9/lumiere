import type { EditorState, Transaction } from "@codemirror/state";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote prefix, then Obsidian callout opener `[!TYPE]` and the
 * required space/tab before the title. Keeps quote markers (BH-064:
 * `> [!NOTE] Title` → `> Title`).
 */
const quotedCallout = /^((?:[ \t]*>[ \t]?)*)(\[![\w-]+\][ \t]+)/u;

/**
 * Backspace at callout title text start unwraps `[!TYPE] ` (BH-064). Leaves
 * `> [!NOTE]Title` (no space) and bare `> [!NOTE]` alone. Keeps quotes.
 */
export function unwrapCalloutTitle(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = quotedCallout.exec(line.text);
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
      userEvent: "delete.callout",
    }),
  );
  return true;
}
