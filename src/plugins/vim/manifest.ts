import { defineManifest } from "../../shared/manifest";
import { Schema } from "../../kernel";
export const config = Schema.object({});
export default defineManifest({
  id: "vim",
  title: "Vim",
  description: "Vim in the Markdown editor.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["webview"],
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
      mac: `cmd+${key}`,
    })),
  },
} as const);
