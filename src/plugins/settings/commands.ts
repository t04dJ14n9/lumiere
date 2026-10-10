/**
 * The note font size range and default of the editor plugin
 * (`editor/font.ts`; a plugin may not import another, a unit test keeps these
 * equal).
 */
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 48;
export const DEFAULT_FONT_SIZE = 16;

/** The extension's id in the Settings UI search (`@ext:`). */
export const EXTENSION_FILTER = "@ext:t04dj14n9.vscode-markdown-workbench";

/**
 * A command that flips one boolean setting. `key` is the same key the
 * Settings UI shows, so the two never disagree: the command reads and writes
 * the setting, and keeps no state of its own.
 */
export interface SettingToggle {
  readonly command: string;
  readonly key: string;
  /** The setting's default, used only when VS Code reports none. */
  readonly fallback: boolean;
  readonly label: string;
}

export const toggles: readonly SettingToggle[] = [
  {
    command: "toggleLineNumbers",
    key: "plugins.lineNumbers.enabled",
    fallback: true,
    label: "Line numbers",
  },
  {
    command: "toggleReadableLineWidth",
    key: "editor.readableLineLength",
    fallback: false,
    label: "Readable line width",
  },
  {
    command: "toggleMermaid",
    key: "plugins.diagrams.enabled",
    fallback: true,
    label: "Mermaid diagrams",
  },
  {
    command: "toggleInlineTitle",
    key: "plugins.inlineTitle.enabled",
    fallback: false,
    label: "Inline title",
  },
  {
    command: "toggleVim",
    key: "plugins.vim.enabled",
    fallback: false,
    label: "Vim mode",
  },
];

/** The note font size setting. */
export const FONT_SIZE_KEY = "editor.fontSize";

/** The note size typed into the prompt: a number in range, else why not. */
export function checkFontSize(text: string): string | undefined {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(value)) {
    return "Enter a number of pixels.";
  }
  if (value < MIN_FONT_SIZE || value > MAX_FONT_SIZE) {
    return `Use a size from ${MIN_FONT_SIZE} to ${MAX_FONT_SIZE}.`;
  }
  return undefined;
}

/** The argument of a command run from a keybinding or another extension. */
export function fontSizeArgument(value: unknown): number | undefined {
  return typeof value === "number" && checkFontSize(String(value)) === undefined
    ? value
    : undefined;
}
