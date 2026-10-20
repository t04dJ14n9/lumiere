import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "diagrams",
  title: "Diagrams",
  description:
    "Render Mermaid diagrams; Allow enables HTML labels after a failed guard.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["rendering"],
});
