import { defineManifest } from "../../shared/manifest";
import { Schema } from "@workshop/core";
export const config = Schema.object({});
export default defineManifest({
  id: "spellcheck",
  title: "Spellcheck",
  description: "Spellcheck in the Markdown editor.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["editorChrome"],
  config,
} as const);
