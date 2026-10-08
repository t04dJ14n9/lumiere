import { Schema } from "../../kernel";
import { defineManifest } from "../../shared/manifest";
export const config = Schema.object({
  mode: Schema.union(["prompt", "always", "never"])
    .default("prompt")
    .description(
      "Obsidian's Automatically update internal links: `prompt` asks before rewriting links in other notes when a file is renamed or moved.",
    ),
});
export default defineManifest({
  id: "linkUpdates",
  title: "Link updates",
  description:
    "Update links in other notes when a note or attachment is renamed or moved in VS Code.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  config,
} as const);
