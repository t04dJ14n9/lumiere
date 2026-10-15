import { Schema } from "../../kernel";
import { defineManifest } from "../../shared/manifest";
export const config = Schema.object({
  compareTo: Schema.union(["HEAD", "index"])
    .default("HEAD")
    .description(
      "What the change bars compare the note with: the last commit (HEAD) or the staged version (index).",
    ),
});
export default defineManifest({
  id: "gitGutter",
  title: "Git change bars",
  description:
    "Added, modified and deleted bars beside the line numbers, like VS Code's quick diff, with a raw unified peek to revert a hunk.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["editorChrome", "rendering", "editing", "commands"],
  config,
  contributes: {
    commands: [
      {
        id: "gitGutter.nextChange",
        title: "Go to Next Git Change",
        editorCommand: "editor:git-next-change",
        key: "alt+f5",
      },
      {
        id: "gitGutter.previousChange",
        title: "Go to Previous Git Change",
        editorCommand: "editor:git-previous-change",
        key: "shift+alt+f5",
      },
      {
        id: "gitGutter.showChange",
        title: "Show Git Change",
        editorCommand: "editor:git-show-change",
        key: "alt+f3",
      },
    ],
  },
} as const);
