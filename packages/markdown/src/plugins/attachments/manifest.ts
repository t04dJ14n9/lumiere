import { defineManifest } from "../../shared/manifest";

export default defineManifest({
  id: "attachments",
  title: "Attachments",
  description:
    "Save dropped, pasted, and HTML-paste images into the vault attachment folder with Obsidian-style embeds.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["editing", "clipboard", "fileWrites"],
});
