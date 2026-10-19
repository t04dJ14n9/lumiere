import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "document",
  title: "Document",
  description: "Document core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["documentModel"],
  contributes: {
    commands: [],
  },
} as const);
