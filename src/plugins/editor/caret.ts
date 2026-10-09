export type CaretMode = "typing" | "normal" | "visual" | "insert" | "replace";
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

export interface CaretAppearance {
  style: CursorStyle;
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
  return {
    style,
    width,
    height,
    variables: {
      "--caret-animation":
        blinking === "solid" ? "none" : `mw-caret-${blinking}`,
      "--caret-timing": blinking === "blink" ? "steps(1, end)" : "linear",
      "--caret-move-duration": movesSmoothly ? "80ms" : "0ms",
    },
  };
}
import { findClusterBreak, type Text } from "@codemirror/state";
