import {
  EditorSelection,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** A scheme and no spaces, as Obsidian tells a URL: https:, mailto:, file:… */
const URL = /^[a-z][a-z\d+.-]*:\S+$/iu;
const UNSAFE = /^(?:javascript|vbscript|data):/iu;

/**
 * Pasting a URL over selected text links the text and selects the link, as
 * in Obsidian. Selections across lines, and pasted text that is not a URL,
 * paste as usual; script and data URLs never become links.
 */
export function linkPaste(
  state: EditorState,
  text: string,
): TransactionSpec | undefined {
  const { ranges } = state.selection;
  if (
    !URL.test(text) ||
    UNSAFE.test(text) ||
    ranges.some(
      (range) =>
        range.empty ||
        state.doc.lineAt(range.from).number !==
          state.doc.lineAt(range.to).number,
    )
  ) {
    return undefined;
  }
  return {
    ...state.changeByRange((range) => {
      const insert = `[${state.sliceDoc(range.from, range.to)}](${text})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from, range.from + insert.length),
      };
    }),
    userEvent: "input.paste",
  };
}

export const linkPasteHandler = EditorView.domEventHandlers({
  paste(event, view) {
    if (event.defaultPrevented || view.state.readOnly) {
      return false;
    }
    const spec = linkPaste(
      view.state,
      event.clipboardData?.getData("text/plain") ?? "",
    );
    if (!spec) {
      return false;
    }
    event.preventDefault();
    view.dispatch(spec);
    return true;
  },
});
