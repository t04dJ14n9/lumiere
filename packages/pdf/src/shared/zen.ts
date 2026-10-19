import type { ToolbarMode } from "./toolbar-settings";

/**
 * The toolbar mode the viewer shows. In zen mode VS Code hides or loses the
 * editor title actions and the status bar, so the controls that live there
 * (`chrome`) or take a row of the screen (`slim`) are a floating bar for as
 * long as zen lasts. `floating` and `none` are what the reader chose. The
 * setting itself is never changed.
 */
export function zenToolbarMode(mode: ToolbarMode, zen: boolean): ToolbarMode {
  return zen && (mode === "chrome" || mode === "slim") ? "floating" : mode;
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
