import { parseToolbarMode, type ToolbarSettings } from '../shared/toolbar-settings';

/**
 * The toolbar settings: first those written into the page, then the latest
 * the extension sent. Kept outside React, so a viewer restarted for a
 * reloaded file starts with the current ones.
 */
let latest: ToolbarSettings | undefined;

export function currentToolbarSettings(): ToolbarSettings {
  latest ??= { mode: parseToolbarMode(document.getElementById('root')?.dataset.toolbar) };
  return latest;
}

export function rememberToolbarSettings(value: unknown): ToolbarSettings {
  const settings = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  latest = { mode: parseToolbarMode(settings.mode) };
  return latest;
}
