import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "search",
  title: "Search blocks",
  description: "Render query blocks as live vault search results.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "vaultIndex"],
});
