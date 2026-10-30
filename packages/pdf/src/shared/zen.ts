import type { ToolbarMode } from "./toolbar-settings";

/**
 * The toolbar mode the viewer shows. Zen no longer forces a floating overlay
 * bar: VS Code hides the status bar in zen, so PDF controls are command /
 * palette only until zen ends. The setting itself is never changed.
 */
export function zenToolbarMode(mode: ToolbarMode, _zen: boolean): ToolbarMode {
  return mode;
}

/**
 * Whether the window has just left full-screen zen: it was as big as the screen
 * while zen was on, and no longer is. A windowed zen (`zenMode.fullScreen` off)
 * cannot be told from outside, and stays until its own exit command.
 */
export class ZenWatch {
  private fullscreen = false;

  /** Feed the window and screen sizes; true once, when full-screen zen has ended. */
  left(
    zen: boolean,
    window: { width: number; height: number },
    screen: { width: number; height: number },
  ): boolean {
    const full = window.width >= screen.width && window.height >= screen.height;
    if (!zen) {
      this.fullscreen = false;
      return false;
    }
    if (full) {
      this.fullscreen = true;
      return false;
    }
    const was = this.fullscreen;
    this.fullscreen = false;
    return was;
  }
}
