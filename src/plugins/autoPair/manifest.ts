import { defineManifest } from "../../shared/manifest";
import { Schema } from "../../kernel";
export const config = Schema.object({
  brackets: Schema.boolean().default(true),
  markdown: Schema.boolean().default(true),
});
export default defineManifest({
  id: "autoPair",
  title: "Auto pair",
  description: "Auto pair in the Markdown editor.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["editing"],
  config,
} as const);
