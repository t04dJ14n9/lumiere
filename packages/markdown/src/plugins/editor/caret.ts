import { findClusterBreak, type Text } from "@codemirror/state";

/**
 * `pending` is an operator waiting for its motion (`d`, `y`, `c`); `prompt` is
 * the search or ex line being typed. VSCodeVim draws both differently.
 */
export type CaretMode =
  "typing" | "normal" | "visual" | "insert" | "replace" | "pending" | "prompt";
export type CursorStyle =
  | "line"
  | "block"
  | "underline"
  | "line-thin"
  | "block-outline"
  | "underline-thin";
export type CursorBlinking = "blink" | "smooth" | "phase" | "expand" | "solid";
export type CursorAnimation = "off" | "explicit" | "on";

/**
 * How Vim draws the caret when the Vim plugin is on.
 * - `obsidian`: CM fat cursor themed like Obsidian 1.14.4 (REA `app.js` /
 *   `app.css`: `--interactive-accent` fill, `--text-on-accent` glyph, 1.06s
 *   step blink). Default.
 * - `vscodevim`: measured VSCodeVim shapes (block / half-block / thin end).
 * - `codemirror`: stock CM-vim fat cursor (inverse editor colours, same blink).
 */
export type VimCaretProfile = "obsidian" | "vscodevim" | "codemirror";

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

const vscodevimStyles = {
  normal: "block",
  visual: "block",
  replace: "underline",
  pending: "half-block",
  prompt: "underline-thin",
} as const;

/** Obsidian / CM-vim: fat block through overwrite and operator-pending. */
const fatStyles = {
  normal: "block",
  visual: "block",
  replace: "block",
  pending: "block",
  prompt: "underline-thin",
} as const;

const obsidianBlink = {
  duration: "1.06s",
  timing: "step-end",
  count: "infinite",
  direction: "normal",
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
/** Width and height of the shape: lines are 2 px (or `editor.cursorWidth`) or 1 px, underlines 2 px or 1 px. */
function dimensions(
  style: CaretShape,
  cursorWidth: number,
): Pick<CaretAppearance, "width" | "height"> {
  let width: CaretAppearance["width"] = "character";
  if (style === "line") {
    width = Number.isFinite(cursorWidth) && cursorWidth > 0 ? cursorWidth : 2;
  } else if (style === "line-thin") {
    width = 1;
  }
  let height: CaretAppearance["height"] = "character";
  if (style === "underline") {
    height = 2;
  } else if (style === "underline-thin") {
    height = 1;
  }
  return { width, height };
}

/** The animation and movement variables the stylesheet reads. */
function animationVariables(
  settings: CaretSettings,
  isExplicitMove: boolean,
): Record<string, string> {
  const animation = settings.cursorSmoothCaretAnimation;
  const movesSmoothly =
    animation === "on" || (animation === "explicit" && isExplicitMove);
  const blinking = settings.cursorBlinking;
  const timing = blinking === "solid" ? undefined : blinkTimings[blinking];
  return {
    "--caret-animation": blinking === "solid" ? "none" : `mw-caret-${blinking}`,
    "--caret-duration": timing?.duration ?? "0s",
    "--caret-timing": timing?.timing ?? "linear",
    "--caret-count": timing?.count ?? "1",
    "--caret-direction": timing?.direction ?? "normal",
    "--caret-move-duration": movesSmoothly ? "80ms" : "0ms",
  };
}

export function caretAppearance(
  settings: CaretSettings,
  mode: CaretMode,
  isExplicitMove = true,
  profile: VimCaretProfile = "vscodevim",
): CaretAppearance {
  // Insert / typing always follow the native editor caret (all profiles).
  const modal = mode !== "typing" && mode !== "insert";
  const styles = profile === "vscodevim" ? vscodevimStyles : fatStyles;
  const style = modal ? styles[mode] : settings.cursorStyle;
  const variables = animationVariables(settings, isExplicitMove);
  if (modal && profile !== "vscodevim") {
    // Obsidian REA: `.cm-animate-fat-cursor` / fat theme uses 1.06s steps(1).
    variables["--caret-animation"] = "mw-caret-blink";
    variables["--caret-duration"] = obsidianBlink.duration;
    variables["--caret-timing"] = obsidianBlink.timing;
    variables["--caret-count"] = obsidianBlink.count;
    variables["--caret-direction"] = obsidianBlink.direction;
  }
  if (modal && profile === "obsidian") {
    // Map Obsidian --interactive-accent / --text-on-accent onto VS Code tokens.
    variables["--caret-foreground"] =
      "var(--vscode-button-background, #0e639c)";
    variables["--caret-background"] =
      "var(--vscode-button-foreground, #ffffff)";
  } else if (modal && profile === "codemirror") {
    variables["--caret-foreground"] =
      "var(--vscode-editor-foreground, var(--vscode-editorCursor-foreground, #222))";
    variables["--caret-background"] = "var(--vscode-editor-background, #fff)";
  }
  return {
    style,
    // VSCodeVim draws a thin end caret in visual; Obsidian/CM fat cursor does not.
    endCaret: mode === "visual" && profile === "vscodevim",
    ...dimensions(style, settings.cursorWidth),
    variables,
  };
}
