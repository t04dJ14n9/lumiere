import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "editor",
  title: "Editor",
  description: "Editor core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  contributes: {
    commands: [],
  },
} as const);
