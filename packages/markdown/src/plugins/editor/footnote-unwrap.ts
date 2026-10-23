import type { EditorState, Transaction } from "@codemirror/state";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote prefix, then footnote definition marker with the
 * required space/tab after `:` (`[^label]: `). Keeps quotes (BH-065:
 * `[^n]: body` → `body`).
 */
const quotedFootnoteDef = /^((?:[ \t]*>[ \t]?)*)( {0,3}\[\^[^\]]+\]:[ \t]+)/u;

/**
 * Backspace at footnote definition body start unwraps `[^label]: `
 * (BH-065). Leaves `[^n]:body` (no space) alone. Keeps quote markers.
 */
export function unwrapFootnoteDefinition(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = quotedFootnoteDef.exec(line.text);
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
      userEvent: "delete.footnote",
    }),
  );
  return true;
}
