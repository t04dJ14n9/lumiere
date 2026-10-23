import { EditorSelection } from "@codemirror/state";
import type { EditorState, Transaction } from "@codemirror/state";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/**
 * Optional blockquote prefix, Obsidian callout opener `[!TYPE]` with optional
 * fold marker `+`/`-`, then the required space/tab before the title (BH-064 /
 * BH-078 opener shape).
 */
const calloutOpener = /^((?:[ \t]*>[ \t]?)*)(\[![\w-]+\][+-]?[ \t]+)/u;

/**
 * Enter / Shift+Enter at callout title content start exits below with the
 * title kept intact (BH-085 / ATX BH-084 / setext BH-082 parity). Without
 * this, quote-continue splits into an empty title line plus body
 * (`> [!NOTE] |Title` → `> [!NOTE] ` / `> |Title`).
 *
 * Mid-title and EOL fall through to quote continue (title stays; suffix
 * becomes the first body line). Empty titles also fall through.
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
  if (body.trim() === "") {
    return false;
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
