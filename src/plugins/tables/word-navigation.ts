import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCM, Vim } from "@replit/codemirror-vim";
import type { VimMode } from "../vim/api";
import type { WordMotion } from "./word-motion";

/** Only completed normal motions may leave a cell; operators own their buffer. */
export function normalWordCommand(key: string, mode: VimMode | undefined) {
  if (
    !mode ||
    mode.insertMode ||
    mode.visualMode ||
    mode.inputState?.operator
  ) {
    return undefined;
  }
  const pending = mode.inputState?.keyBuffer?.join("") ?? "";
  const match = /^([1-9]\d*)?(g?[eE]|[wWbB])$/.exec(pending + key);
  if (!match) {
    return undefined;
  }
  return { motion: match[2] as WordMotion, count: Number(match[1] ?? 1) };
}

export function cellWordNavigation(
  move: (motion: WordMotion, count: number) => boolean,
) {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (
          event.isComposing ||
          view.composing ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        ) {
          return false;
        }
        const cm = getCM(view);
        const command = normalWordCommand(
          event.key,
          cm?.state.vim ?? undefined,
        );
        if (
          !cm ||
          !command ||
          view.state.selection.ranges.length !== 1 ||
          !view.state.selection.main.empty
        ) {
          return false;
        }
        // Clear a count or g prefix before opening a new cell destroys this adapter.
        Vim.handleKey(cm, "<Esc>", "api");
        if (!move(command.motion, command.count)) {
          return false;
        }
        event.stopPropagation();
        return true;
      },
    }),
  );
}
