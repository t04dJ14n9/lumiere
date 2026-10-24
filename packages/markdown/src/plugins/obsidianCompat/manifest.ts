import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";

export const config = Schema.object({
  configFolder: Schema.string()
    .default(".obsidian")
    .description(
      "Obsidian configuration folder relative to the vault root, such as .obsidian-awesome. Root markers discover the vault; they do not select this folder.",
    ),
});

export default defineManifest({
  id: "obsidianCompat",
  title: "Obsidian Compatibility",
  description:
    "Use Obsidian property types, vault settings, native obsidian API, and community plugins in Lumière.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["resourceLoading"],
  config,
} as const);
