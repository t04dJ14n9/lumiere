import type { EditorView } from "@codemirror/view";
import type { CodeMirror } from "@replit/codemirror-vim";
import type { WordMotion } from "./word-motion";

type VimState = NonNullable<CodeMirror["state"]["vim"]>;

/** Interpret a resolved Vim command, including mappings and macro playback. */
export function normalWordCommand(
  input: VimState["inputState"],
  mode: VimState,
) {
  if (
    mode.insertMode ||
    mode.visualMode ||
    input.operator ||
    input.motion !== "moveByWords" ||
    !input.motionArgs
  ) {
    return undefined;
  }
  const args = input.motionArgs;
  let motion = args.wordEnd ? "e" : "w";
  if (!args.forward) {
    motion = args.wordEnd ? "ge" : "b";
  }
  if (args.bigWord) {
    motion = motion.slice(0, -1) + motion.at(-1)?.toUpperCase();
  }
  return { motion: motion as WordMotion, count: args.repeat };
}

/** Keep Vim's recorder/dispatcher; replace only a resolved normal word landing. */
export function installCellWordNavigation(
  view: EditorView,
  cm: CodeMirror,
  move: (motion: WordMotion, count: number) => boolean,
) {
  const mode = cm.state.vim;
  if (!mode) {
    return { destroy() {} };
  }
  const descriptor = Object.getOwnPropertyDescriptor(mode, "inputState");
  const original = cm.setCursor;
  let input = mode.inputState;
  let command: ReturnType<typeof normalWordCommand>;
  // Pinned Vim clears inputState after resolving mappings/counts and before
  // executing the motion. Chain the existing observer used for block motions.
  Object.defineProperty(mode, "inputState", {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get: () => input,
    set(next: typeof input) {
      command = normalWordCommand(input, mode);
      input = next;
      descriptor?.set?.call(mode, next);
    },
  });
  cm.setCursor = (line, ch?: number) => {
    const resolved = command;
    command = undefined;
    if (
      resolved &&
      canMoveWord(view) &&
      move(resolved.motion, resolved.count)
    ) {
      return;
    }
    const position = typeof line === "number" ? { line, ch: ch ?? 0 } : line;
    original.call(cm, position);
  };
  return {
    destroy() {
      cm.setCursor = original;
      const restored = descriptor?.get
        ? descriptor
        : { ...descriptor, value: input };
      Object.defineProperty(mode, "inputState", restored);
    },
  };
}

function canMoveWord(view: EditorView): boolean {
  return (
    !view.composing &&
    view.state.selection.ranges.length === 1 &&
    view.state.selection.main.empty
  );
}
