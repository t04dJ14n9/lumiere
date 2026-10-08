import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "inlineTitle",
  title: "Inline title",
  description: "Show and rename the note title above its Markdown content.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
});
