import { defineManifest } from "../../shared/manifest";
import { Schema } from "../../kernel";
export const config = Schema.object({
  /** Follows VS Code's `editor.lineNumbers` for Markdown files. */
  style: Schema.union(["on", "off", "relative", "interval"]).default("on"),
});
export default defineManifest({
  id: "lineNumbers",
  title: "Line numbers",
  description:
    "Line numbers in the Markdown editor, laid out like VS Code's text editor and following editor.lineNumbers.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["editorChrome"],
  config,
  nativeConfigKeys: { style: "editor.lineNumbers" },
} as const);
