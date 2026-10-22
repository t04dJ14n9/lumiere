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
      // BH-034: consume ctrl+n so workbench New Untitled File cannot steal
      // vim-core's <C-n>→j (same pattern as ctrl+o → jumplist).
      "n",
      "b",
      "i",
      "k",
      // BH-030: do not consume ctrl+alt+0..6 — Obsidian Set Heading 0–6
      // (formatting owns those chords). Vim-core has no <C-A-N> map; the
      // host noop left Ctrl+Alt+N dead while Vim is on.
      // BH-026: do not consume ctrl+shift+h — VS Code Replace in Files
      // (workbench.action.replaceInFiles). Vim-core has no <C-S-h> map; the
      // host noop left the chord dead while Vim is on.
      // BH-027: same for ctrl+shift+x (Extensions) and ctrl+shift+t (Reopen
      // Closed Editor). Vim-core has <C-x>/<C-t>/X, not <C-S-x>/<C-S-t>.
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
