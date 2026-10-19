import {
  parseToolbarSettings,
  type ToolbarSettings,
} from "../shared/toolbar-settings";

/**
 * The toolbar settings: first those written into the page, then the latest
 * the extension sent. Kept outside React, so a viewer restarted for a
 * reloaded file starts with the current ones.
 */
let latest: ToolbarSettings | undefined;

export function currentToolbarSettings(): ToolbarSettings {
  const root = document.getElementById("root");
  latest ??= parseToolbarSettings({
    mode: root?.dataset.toolbar,
    dock: root?.dataset.dock,
  });
  return latest;
}

export function rememberToolbarSettings(value: unknown): ToolbarSettings {
  latest = parseToolbarSettings(value);
  return latest;
}
