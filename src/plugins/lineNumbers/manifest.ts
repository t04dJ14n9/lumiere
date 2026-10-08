import { defineManifest } from "../../shared/manifest";
import { Schema } from "../../kernel";
export const config = Schema.object({});
export default defineManifest({
  id: "lineNumbers",
  title: "Line numbers",
  description: "Line numbers in the Markdown editor.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["webview"],
  config,
} as const);
