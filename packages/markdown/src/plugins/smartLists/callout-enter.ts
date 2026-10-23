import { EditorSelection } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote prefix, Obsidian callout opener `[!TYPE]` with optional
 * fold marker `+`/`-`, then the required space/tab before the title (BH-064 /
 * BH-078 / BH-085 opener shape).
 */
const calloutOpener = /^((?:[ \t]*>[ \t]?)*)(\[![\w-]+\][+-]?[ \t]+)/u;

/**
 * Enter / Shift+Enter at callout title content start:
 * - Non-empty: exit below with the title kept intact (BH-085 / ATX BH-084 /
 *   setext BH-082 parity). Without this, quote-continue splits into an empty
 *   title line plus body (`> [!NOTE] |Title` → `> [!NOTE] ` / `> |Title`).
 * - Empty: unwrap `[!TYPE] ` / fold (BH-086 / ATX empty Enter parity) instead
 *   of leaving a blank callout opener (`> [!NOTE] |` → `> |`).
 *
 * Mid-title and EOL fall through to quote continue (title stays; suffix
 * becomes the first body line).
 */
export function exitCalloutTitle(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const caret = range.head;
  const line = state.doc.lineAt(caret);
  const match = calloutOpener.exec(line.text);
  if (!match) {
    return false;
  }
  const quotes = match[1] ?? "";
  const marker = match[2] ?? "";
  const contentStart = line.from + quotes.length + marker.length;
  if (caret !== contentStart) {
    return false;
  }
  const body = line.text.slice(quotes.length + marker.length);
  // Empty title: unwrap opener (BH-086).
  if (body.trim() === "") {
    const markerFrom = line.from + quotes.length;
    const markerTo = markerFrom + marker.length;
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
  const insert = state.lineBreak + quotes;
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
