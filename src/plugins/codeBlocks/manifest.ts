import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "codeBlocks",
  title: "Code Blocks",
  description: "Highlight rendered and editable code fences; copy code.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
});
