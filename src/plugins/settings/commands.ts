/** The extension's id in the Settings UI search (`@ext:`). */
export const EXTENSION_FILTER = "@ext:t04dj14n9.vscode-markdown-workshop";

/**
 * A command that flips one boolean setting. `key` is the same key the
 * Settings UI shows, so the two never disagree: the command reads and writes
 * the setting, and keeps no state of its own. The key must be a boolean
 * setting in package.json (a unit test checks every one), and its default is
 * the schema's, not a copy here.
 */
export interface SettingToggle {
  readonly command: string;
  readonly key: string;
  readonly label: string;
}

export const toggles: readonly SettingToggle[] = [
  {
    command: "toggleLineNumbers",
    key: "plugins.lineNumbers.enabled",
    label: "Line numbers",
  },
  {
    command: "toggleReadableLineWidth",
    key: "editor.readableLineLength",
    label: "Readable line width",
  },
  {
    command: "toggleMermaid",
    key: "plugins.diagrams.enabled",
    label: "Mermaid diagrams",
  },
  {
    command: "toggleInlineTitle",
    key: "plugins.inlineTitle.enabled",
    label: "Inline title",
  },
  {
    command: "toggleInlineGitChanges",
    key: "plugins.gitInline.enabled",
    label: "Inline git changes",
  },
  {
    command: "toggleVim",
    key: "plugins.vim.enabled",
    label: "Vim mode",
  },
];

/** The note font size setting, a number in package.json. */
export const FONT_SIZE_KEY = "editor.fontSize";
