import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "pasteHtml",
  title: "Convert HTML paste",
  description:
    "Convert rich clipboard HTML into Markdown in notes and table cells.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["editing", "clipboard"],
});
