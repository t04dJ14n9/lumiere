import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "pagePreview",
  title: "Page Preview",
  description: "Preview internal links with a modifier hover or keyboard.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["rendering", "vaultIndex", "navigation"],
});
