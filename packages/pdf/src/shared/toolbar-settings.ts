/**
 * Where the viewer's controls are (setting `lumiere.pdf.toolbar.mode`):
 *   chrome    VS Code's own: editor title actions and the status bar
 *   slim      a slim bar along the top of the viewer
 *   floating  a bar over the pages, docked to an edge the reader drags it to
 *   none      no controls; keyboard shortcuts, menus and commands only
 */
export type ToolbarMode = "chrome" | "slim" | "floating" | "none";
export const TOOLBAR_MODES: readonly ToolbarMode[] = [
  "chrome",
  "slim",
  "floating",
  "none",
];
export const DEFAULT_TOOLBAR_MODE: ToolbarMode = "chrome";

/** The edge of the viewer the floating bar is docked to. */
export type FloatingDock = "top" | "bottom" | "left" | "right";
export const FLOATING_DOCKS: readonly FloatingDock[] = [
  "top",
  "bottom",
  "left",
  "right",
];
export const DEFAULT_FLOATING_DOCK: FloatingDock = "bottom";

/** The toolbar settings the viewer needs. */
export interface ToolbarSettings {
  mode: ToolbarMode;
  /** Where the floating bar is; the reader's choice, kept by the extension. */
  dock: FloatingDock;
}

export const DEFAULT_TOOLBAR_SETTINGS: ToolbarSettings = {
  mode: DEFAULT_TOOLBAR_MODE,
  dock: DEFAULT_FLOATING_DOCK,
};

/** A setting's value as a mode; anything unknown is the default. */
export function parseToolbarMode(value: unknown): ToolbarMode {
  return TOOLBAR_MODES.includes(value as ToolbarMode)
    ? (value as ToolbarMode)
    : DEFAULT_TOOLBAR_MODE;
}

export function isFloatingDock(value: unknown): value is FloatingDock {
  return FLOATING_DOCKS.includes(value as FloatingDock);
}

/** A stored dock; anything unknown is the default. */
export function parseFloatingDock(value: unknown): FloatingDock {
  return isFloatingDock(value) ? value : DEFAULT_FLOATING_DOCK;
}

/** Toolbar settings from a message, with defaults for anything malformed. */
export function parseToolbarSettings(value: unknown): ToolbarSettings {
  const settings =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    mode: parseToolbarMode(settings.mode),
    dock: parseFloatingDock(settings.dock),
  };
}

/**
 * The edge nearest to a point in a box of `width` by `height`: where a
 * dragged floating bar docks when dropped there.
 */
export function nearestDock(
  x: number,
  y: number,
  width: number,
  height: number,
): FloatingDock {
  const distances: [FloatingDock, number][] = [
    ["top", y],
    ["bottom", height - y],
    ["left", x],
    ["right", width - x],
  ];
  return distances.reduce((nearest, next) =>
    next[1] < nearest[1] ? next : nearest,
  )[0];
}

/**
 * Whether the editor title bar keeps extension buttons in its "…" menu
 * rather than showing them, as Cursor's does.
 */
export function titleActionsInMenu(appName: string): boolean {
  return /cursor/iu.test(appName);
}

/**
 * Whether the status bar shows page and zoom buttons besides the page and
 * zoom (setting `lumiere.pdf.toolbar.statusBarButtons`). `auto` shows
 * them in Cursor, whose editor title bar keeps extension buttons in its
 * "…" menu, so the status bar is the only place they are always in view.
 */
export function showStatusBarButtons(
  setting: unknown,
  appName: string,
): boolean {
  if (setting === "always") {
    return true;
  }
  if (setting === "never") {
    return false;
  }
  return titleActionsInMenu(appName);
}
