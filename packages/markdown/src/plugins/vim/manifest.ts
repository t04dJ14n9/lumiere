import { defineManifest } from "../../shared/manifest";
import { Schema } from "@workshop/core";

export const config = Schema.object({
  /**
   * Obsidian 1.14.4 fat caret (default), VSCodeVim shapes, or stock CM-vim fat
   * cursor with inverse editor colours.
   */
  caretStyle: Schema.union(["obsidian", "vscodevim", "codemirror"]).default(
    "obsidian",
  ),
});

export default defineManifest({
  id: "vim",
  title: "Vim",
  description: "Vim in the Markdown editor.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["webview"],
  capabilities: ["editing", "commands", "keybindings"],
  config,
  contributes: {
    commands: [
      {
        id: "consumeVimHostShortcut",
        title: "Consume Vim Host Shortcut",
        editorCommand: "vim:consume-host-shortcut",
        palette: false,
      },
    ],
    keybindings: [
      "o",
      "b",
      "i",
      "shift+x",
      "k",
      "alt+0",
      "alt+1",
      "alt+2",
      "alt+3",
      "alt+4",
      "alt+5",
      "alt+6",
      "shift+t",
      "shift+h",
    ].map((key) => ({
      id: "consumeVimHostShortcut",
      key: `ctrl+${key}`,
      // Vim uses Control on macOS too; Command remains available to the editor.
      mac: `ctrl+${key}`,
      // Cursor's Edit key takes precedence over the host-shortcut consumer.
      ...(key === "k" ? { when: "!lumiere.markdown.isCursorHost" } : {}),
      // Formatting owns Ctrl+B/I (bold/italic). Host consume would noop the
      // chord before the webview, so Vim page-back/jumplist never yields to
      // toggleBold/toggleItalics (BH-024). Physical PageUp still keyToKeys to
      // <C-b> inside vim-core without this host binding.
      ...(key === "b" || key === "i"
        ? { when: "!lumiere.markdown.plugin.formatting" }
        : {}),
    })),
  },
} as const);
