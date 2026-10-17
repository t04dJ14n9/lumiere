import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";

export const config = Schema.object({
  diffEditor: Schema.union(["native", "rendered"])
    .default("native")
    .description(
      "How a Markdown diff opened from Source Control or the Timeline is shown: VS Code's text diff (native), or both versions rendered side by side (rendered).",
    ),
});

export default defineManifest({
  id: "gitDiffEditor",
  title: "Rendered git diff",
  description:
    "A side-by-side diff of two versions of a note, both rendered, blocks aligned and changed words marked. Opens from Source Control when diffEditor is rendered.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["commands", "rendering"],
  config,
  contributes: {
    commands: [
      {
        id: "gitDiffEditor.open",
        title: "Open Rendered Git Diff",
        icon: "$(diff)",
        scope: "workbench",
      },
    ],
  },
} as const);
