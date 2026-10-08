import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "tags",
  title: "Tags",
  description: "Render tags and find notes with matching hierarchical tags.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
});
