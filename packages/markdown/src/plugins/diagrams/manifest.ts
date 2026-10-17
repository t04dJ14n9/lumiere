import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "diagrams",
  title: "Diagrams",
  description: "Render Mermaid diagrams in strict mode.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["rendering"],
});
