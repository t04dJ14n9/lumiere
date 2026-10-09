import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "render",
  title: "Rendered Content",
  description: "Rendered Content core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["rendering"],
  contributes: {
    commands: [],
  },
} as const);
