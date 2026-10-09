import { defineManifest } from "../../shared/manifest";
import { Schema } from "../../kernel";
export const config = Schema.object({});
export default defineManifest({
  id: "smartLists",
  title: "Smart lists",
  description: "Smart lists in the Markdown editor.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["editing"],
  config,
} as const);
