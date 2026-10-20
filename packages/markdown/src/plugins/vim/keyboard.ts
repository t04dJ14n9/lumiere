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

/**
 * Under an IME, letter and digit keydowns often arrive as `Process` /
 * `Unidentified`. codemirror-vim then waits for a text input, but Lumière's
 * normal-mode beforeinput guard suppresses that path, so `gg`, counts and
 * motions never run. Map the physical code back to a Latin command key.
 */
export function imeVimCommandKey(
  event: KeyEvent,
  mode: VimMode,
): string | undefined {
  if (
    !mode ||
    mode.insertMode ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    !["Process", "Unidentified"].includes(event.key)
  ) {
    return undefined;
  }
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter) {
    const value = letter[1]!;
    return event.shiftKey ? value : value.toLowerCase();
  }
  const digit = /^Digit([0-9])$/.exec(event.code);
  if (digit && !event.shiftKey) {
    return digit[1];
  }
  return undefined;
}

/** Resolve either the Chinese line-motion keys or an IME Process command key. */
export function translatedVimKey(
  event: KeyEvent,
  mode: VimMode,
): string | undefined {
  return shiftedVimLineKey(event, mode) ?? imeVimCommandKey(event, mode);
}

/** The note and temporary cell buffers share the same keyboard translation. */
export const vimLineKeyboard = ViewPlugin.define((view) => {
  const keydown = (event: KeyboardEvent) => routeTranslatedKey(view, event);
  // Capture precedes CM's composition filter and Vim's Process/text fallback.
  view.contentDOM.addEventListener("keydown", keydown, true);
  return {
    destroy() {
      view.contentDOM.removeEventListener("keydown", keydown, true);
    },
  };
});

function routeTranslatedKey(view: EditorView, event: KeyboardEvent): void {
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
  const key = translatedVimKey(event, cm?.state.vim);
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
      keyCode: commandKeyCode(key, event.code),
      shiftKey: event.shiftKey,
      repeat: event.repeat,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function commandKeyCode(key: string, code: string): number {
  if (key === "$") {
    return 52;
  }
  if (key === "^") {
    return 54;
  }
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return letter[1]!.charCodeAt(0);
  }
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) {
    return 48 + Number(digit[1]);
  }
  return key.charCodeAt(0);
}
