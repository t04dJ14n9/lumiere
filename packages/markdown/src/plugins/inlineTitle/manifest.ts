import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "inlineTitle",
  title: "Inline title",
  description: "Show and rename the note title above its Markdown content.",
  kind: "feature",
  // Off by default (owner decision): line 1 starts at the top, as in VS Code.
  defaultEnabled: false,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "fileWrites"],
});
