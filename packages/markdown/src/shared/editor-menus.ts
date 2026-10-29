/**
 * The submenus of a note's right-click menu, which group its items as
 * Obsidian's editor menu does. A plugin's `webview/context` item names the
 * submenu it belongs in; the generator contributes each submenu some plugin
 * fills (VS Code's `contributes.submenus`). VS Code hides a submenu while
 * none of its items shows, and so does host-node.
 */
export const EDITOR_SUBMENUS = {
  format: { label: "Format", group: "formatting@1" },
  highlight: { label: "Highlight", group: "formatting@2" },
  insert: { label: "Insert", group: "formatting@3" },
} as const;

export type EditorSubmenu = keyof typeof EDITOR_SUBMENUS;
