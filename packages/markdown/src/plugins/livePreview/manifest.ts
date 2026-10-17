import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "livePreview",
  title: "Live Preview",
  description: "Live Preview core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "commands"],
  contributes: {
    commands: [
      {
        id: "toggleSourceMode",
        title: "Toggle Live Preview/Source Mode",
        editorCommand: "editor:toggle-source",
      },
    ],
  },
} as const);
