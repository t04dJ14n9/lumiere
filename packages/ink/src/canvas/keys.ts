/**
 * The canvas's keys. It is modal: while it is open, the window's own
 * shortcuts and the app menu's wait (⌘W would close the note being drawn
 * in), except the system's own: quitting, hiding and minimizing.
 */

export type CanvasKeyAction = "undo" | "redo" | "done" | "cancel" | "swallow";

export interface CanvasKeyPress {
  readonly key: string;
  readonly code: string;
  /** ⌘ on macOS and iPadOS, Ctrl elsewhere. */
  readonly mod: boolean;
  readonly shiftKey: boolean;
}

/** ⌘Q, ⌘H and ⌘M stay the system's. */
const SYSTEM_KEYS = new Set(["KeyQ", "KeyH", "KeyM"]);

export function canvasKeyAction(
  press: CanvasKeyPress,
): CanvasKeyAction | undefined {
  if (press.key === "Escape") {
    return "cancel";
  }
  if (!press.mod) {
    return undefined;
  }
  switch (press.code) {
    case "KeyZ":
      return press.shiftKey ? "redo" : "undo";
    case "KeyY":
      return "redo";
    case "Enter":
    case "NumpadEnter":
      return "done";
    default:
      return SYSTEM_KEYS.has(press.code) ? undefined : "swallow";
  }
}

export function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad/.test(platform);
}
