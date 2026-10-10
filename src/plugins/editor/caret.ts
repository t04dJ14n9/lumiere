import { findClusterBreak, type Text } from "@codemirror/state";

/**
 * `pending` is an operator waiting for its motion (`d`, `y`, `c`); `prompt` is
 * the search or ex line being typed. VSCodeVim draws both differently.
 */
export type CaretMode =
  | "typing"
  | "normal"
  | "visual"
  | "insert"
  | "replace"
  | "pending"
  | "prompt";
export type CursorStyle =
  | "line"
  | "block"
  | "underline"
  | "line-thin"
  | "block-outline"
  | "underline-thin";
export type CursorBlinking = "blink" | "smooth" | "phase" | "expand" | "solid";
export type CursorAnimation = "off" | "explicit" | "on";

export interface CaretSettings {
  cursorStyle: CursorStyle;
  cursorBlinking: CursorBlinking;
  cursorSmoothCaretAnimation: CursorAnimation;
  cursorWidth: number;
}

/** The shapes a caret is drawn in: VS Code's six, plus the Vim operator-pending half block. */
export type CaretShape = CursorStyle | "half-block";

export interface CaretAppearance {
  style: CaretShape;
  /** Also draw a one-pixel caret at the active end of each selection (Vim visual). */
  endCaret: boolean;
  width: number | "character";
  height: number | "character";
  variables: Record<string, string>;
}

/** Forward visual selections include the active character in their range. */
export function caretCharacterPosition(
  document: Text,
  range: { readonly anchor: number; readonly head: number },
  mode: CaretMode,
): number {
  const head = range.head;
  if (
    (mode !== "visual" && mode !== "replace") ||
    range.anchor >= head ||
    document.sliceString(head, head + 1) === "\n"
  ) {
    return head;
  }
  const line = document.lineAt(head);
  if (head === line.from) {
    return Math.max(0, head - 1);
  }
  return line.from + findClusterBreak(line.text, head - line.from, false);
}

const vimStyles = {
  normal: "block",
  visual: "block",
  insert: "line",
  replace: "underline",
  pending: "half-block",
  prompt: "underline-thin",
} as const;

/**
 * VS Code's own timings (measured in the built-in editor, docs/vim-caret.md):
 * `blink` is a hard 500 ms on, 500 ms off for as long as the editor is
 * focused; `smooth`, `phase` and `expand` fade or collapse over 0.5 s, back and
 * forth for 20 half cycles (10 s), then stay solid until the caret moves.
 */
const blinkTimings = {
  blink: {
    duration: "1s",
    timing: "step-end",
    count: "infinite",
    direction: "normal",
  },
  smooth: {
    duration: "0.5s",
    timing: "ease-in-out",
    count: "20",
    direction: "alternate",
  },
  phase: {
    duration: "0.5s",
    timing: "ease-in-out",
    count: "20",
    direction: "alternate",
  },
  expand: {
    duration: "0.5s",
    timing: "ease-in-out",
    count: "20",
    direction: "alternate",
  },
} as const;

/** Shape is modal in Vim; blinking and movement always follow native settings. */
export function caretAppearance(
  settings: CaretSettings,
  mode: CaretMode,
  isExplicitMove = true,
): CaretAppearance {
  const style = mode === "typing" ? settings.cursorStyle : vimStyles[mode];
  let width: CaretAppearance["width"] = "character";
  if (style === "line") {
    const requested = settings.cursorWidth;
    width = Number.isFinite(requested) && requested > 0 ? requested : 2;
  } else if (style === "line-thin") {
    width = 1;
  }
  let height: CaretAppearance["height"] = "character";
  if (style === "underline") {
    height = 2;
  } else if (style === "underline-thin") {
    height = 1;
  }
  const animation = settings.cursorSmoothCaretAnimation;
  const movesSmoothly =
    animation === "on" || (animation === "explicit" && isExplicitMove);
  const blinking = settings.cursorBlinking;
  const timing = blinking === "solid" ? undefined : blinkTimings[blinking];
  return {
    style,
    endCaret: mode === "visual",
    width,
    height,
    variables: {
      "--caret-animation":
        blinking === "solid" ? "none" : `mw-caret-${blinking}`,
      "--caret-duration": timing?.duration ?? "0s",
      "--caret-timing": timing?.timing ?? "linear",
      "--caret-count": timing?.count ?? "1",
      "--caret-direction": timing?.direction ?? "normal",
      "--caret-move-duration": movesSmoothly ? "80ms" : "0ms",
    },
  };
}
