import { Schema } from "../../kernel";
import { defineManifest } from "../../shared/manifest";

export const config = Schema.object({
  path: Schema.string()
    .default("")
    .description(
      "Project-relative assets folder used when the folder has no .wiki/layout.json. Empty uses assets. The folder is created on import, not on open.",
    ),
});

export default defineManifest({
  id: "assets",
  title: "Assets",
  description:
    "Import a file into the project's assets folder and insert a portable Markdown link.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["commands", "fileWrites"],
  config,
  contributes: {
    commands: [
      {
        id: "assets.import",
        title: "Import Asset",
        scope: "workbench",
      },
    ],
  },
} as const);
