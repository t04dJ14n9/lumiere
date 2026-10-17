import { defineManifest } from "../../shared/manifest";
import { Schema } from "@workshop/core";
export const config = Schema.object({});
export default defineManifest({
  id: "indentGuides",
  title: "Indentation guides",
  description: "Indentation guides in the Markdown editor.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["editorChrome"],
  config,
} as const);
