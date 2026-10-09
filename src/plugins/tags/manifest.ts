import { Schema } from "../../kernel";
import { defineManifest } from "../../shared/manifest";
export const config = Schema.object({
  viewSort: Schema.union(["name", "frequency"])
    .default("name")
    .description(
      "Order of the Tags view: `name` (A to Z) or `frequency` (most notes first).",
    ),
  viewNested: Schema.boolean()
    .default(true)
    .description(
      "Show nested tags (`#a/b`) under their parent in the Tags view, rather than as a flat list.",
    ),
});
export default defineManifest({
  id: "tags",
  title: "Tags",
  description:
    "Render tags, find notes with matching hierarchical tags, and list the vault's tags in the Tags view.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["syntax", "rendering", "vaultIndex", "views"],
  config,
  contributes: {
    views: [{ id: "tags", name: "Tags", scope: "workbench" }],
  },
} as const);
