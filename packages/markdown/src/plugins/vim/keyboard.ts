import { ViewPlugin, type EditorView } from "@codemirror/view";
import { getCM, type CodeMirror } from "@replit/codemirror-vim";

type VimMode = CodeMirror["state"]["vim"];
type KeyEvent = Pick<
  KeyboardEvent,
  | "key"
  | "code"
  | "shiftKey"
  | "ctrlKey"
  | "altKey"
  | "metaKey"
  | "defaultPrevented"
>;

/** Translate only the shifted Chinese number-row keys used for line motions. */
export function shiftedVimLineKey(
  event: KeyEvent,
  mode: VimMode,
): "$" | "^" | undefined {
  if (
    !mode ||
    mode.insertMode ||
    mode.visualMode ||
    mode.expectLiteralNext ||
    event.defaultPrevented ||
    !event.shiftKey ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  ) {
    return undefined;
  }
  if (event.code === "Digit4" && ["￥", "¥", "Process"].includes(event.key)) {
    return "$";
  }
  if (event.code === "Digit6" && ["……", "…", "Process"].includes(event.key)) {
    return "^";
  }
  return undefined;
}

/** The note and temporary cell buffers share the same keyboard translation. */
export const vimLineKeyboard = ViewPlugin.define((view) => {
  const keydown = (event: KeyboardEvent) => routeShiftedLineKey(view, event);
  // Capture precedes CM's composition filter and Vim's Process/text fallback.
  view.contentDOM.addEventListener("keydown", keydown, true);
  return {
    destroy() {
      view.contentDOM.removeEventListener("keydown", keydown, true);
    },
  };
});

function routeShiftedLineKey(view: EditorView, event: KeyboardEvent): void {
  const cm = getCM(view);
  // compositionStarted also covers the interval before the first IME edit.
  // A recorder notification is a dialog too, but only prompts contain input.
  if (
    view.compositionStarted ||
    cm?.state.dialog?.querySelector("input") ||
    event.target !== view.contentDOM
  ) {
    return;
  }
  const key = shiftedVimLineKey(event, cm?.state.vim);
  if (!key) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  // Re-enter the ordinary DOM handler with a non-composing command key. This
  // preserves mappings, counts, operators, recording and command-done signals.
  // ASCII keys are never translated, so this cannot recursively route itself.
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: event.code,
      keyCode: key === "$" ? 52 : 54,
      shiftKey: true,
      repeat: event.repeat,
      bubbles: true,
      cancelable: true,
    }),
  );
}
