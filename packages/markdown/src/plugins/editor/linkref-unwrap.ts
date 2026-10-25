import type { EditorState, Transaction } from "@codemirror/state";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote prefix, then a CommonMark link reference definition
 * marker with the required space/tab after `:` (`[label]: `). Not a footnote
 * (`[^label]:` — BH-065). Label cannot contain `]` or newlines.
 */
const quotedLinkRef = /^((?:[ \t]*>[ \t]?)*)( {0,3}\[(?!\^)[^\]\n]+\]:[ \t]+)/u;

/**
 * Backspace at link reference definition destination start unwraps
 * `[label]: ` (BH-071). Leaves `[lab]:url` (no space) alone. Keeps quotes.
 * Same class as footnote-def unwrap (BH-065).
 */
export function unwrapLinkReferenceDefinition(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const match = quotedLinkRef.exec(line.text);
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
      userEvent: "delete.linkref",
    }),
  );
  return true;
}
