/**
 * Where the viewer's controls are (setting `vscodeEmbedPdf.toolbar.mode`):
 *   chrome    VS Code's own: editor title actions and the status bar
 *   slim      a slim bar along the top of the viewer
 *   none      no controls; keyboard shortcuts, menus and commands only
 */
export type ToolbarMode = 'chrome' | 'slim' | 'none';
export const TOOLBAR_MODES: readonly ToolbarMode[] = ['chrome', 'slim', 'none'];
export const DEFAULT_TOOLBAR_MODE: ToolbarMode = 'chrome';

/** The toolbar settings the viewer needs. */
export interface ToolbarSettings {
  mode: ToolbarMode;
}

/** A setting's value as a mode; anything unknown is the default. */
export function parseToolbarMode(value: unknown): ToolbarMode {
  return TOOLBAR_MODES.includes(value as ToolbarMode) ? value as ToolbarMode : DEFAULT_TOOLBAR_MODE;
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
 * zoom (setting `vscodeEmbedPdf.toolbar.statusBarButtons`). `auto` shows
 * them in Cursor, whose editor title bar keeps extension buttons in its
 * "…" menu, so the status bar is the only place they are always in view.
 */
export function showStatusBarButtons(setting: unknown, appName: string): boolean {
  if (setting === 'always') return true;
  if (setting === 'never') return false;
  return titleActionsInMenu(appName);
}
