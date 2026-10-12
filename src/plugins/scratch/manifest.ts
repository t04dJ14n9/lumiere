import { Schema } from "../../kernel";
import { defineManifest } from "../../shared/manifest";

export const config = Schema.object({
  folder: Schema.string()
    .default("scratch")
    .description(
      "Project-relative folder for scratch notes when the folder has no .wiki/layout.json. A loaded layout uses its scratch path. The folder is created when you create a note.",
    ),
});

export default defineManifest({
  id: "scratch",
  title: "Scratch",
  description:
    "Temporary notes outside the wiki bundle. Promote one into the wiki only when you ask.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["commands", "fileWrites"],
  config,
  contributes: {
    commands: [
      {
        id: "scratch.new",
        title: "New Scratch Note",
        scope: "workbench",
      },
      {
        id: "scratch.promote",
        title: "Promote Scratch Note",
        scope: "workbench",
      },
    ],
  },
} as const);
