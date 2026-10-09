import { defineManifest } from "../../shared/manifest";
import { Schema } from "../../kernel";
export const config = Schema.object({
  heading: Schema.boolean().default(true),
  indent: Schema.boolean().default(true),
});
export default defineManifest({
  id: "folding",
  title: "Folding",
  description: "Folding in the Markdown editor.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["editorChrome", "commands"],
  config,
  contributes: {
    commands: [
      { id: "foldAll", title: "Fold All", editorCommand: "editor:fold-all" },
      {
        id: "unfoldAll",
        title: "Unfold All",
        editorCommand: "editor:unfold-all",
      },
      {
        id: "toggleFold",
        title: "Toggle Fold",
        editorCommand: "editor:toggle-fold",
      },
    ],
  },
} as const);
