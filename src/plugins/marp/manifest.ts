import { Schema } from "../../kernel";
import { defineManifest } from "../../shared/manifest";

export const config = Schema.object({
  open: Schema.union(["workbench", "textEditor"])
    .default("workbench")
    .description(
      "Where a Marp deck opens. textEditor sends it to VS Code's text editor, where Marp's own preview and export run. Keep in Workbench remembers a deck.",
    ),
});

export default defineManifest({
  id: "marp",
  title: "Marp",
  description:
    "Detect Marp decks and open Marp's preview or export. Decks inside a wiki bundle are not wrapped into pages.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["commands", "fileWrites"],
  config,
  contributes: {
    commands: [
      {
        id: "marp.preview",
        title: "Open Marp Preview to the Side",
        scope: "workbench",
      },
      {
        id: "marp.export",
        title: "Export Marp Slide Deck",
        scope: "workbench",
      },
      {
        id: "marp.toggle",
        title: "Toggle Marp",
        scope: "workbench",
      },
      {
        id: "marp.moveOutside",
        title: "Move Marp Deck Outside Bundle",
        scope: "workbench",
      },
      {
        id: "marp.keepInWorkbench",
        title: "Keep Marp Deck in Workbench",
        scope: "workbench",
      },
    ],
  },
} as const);
