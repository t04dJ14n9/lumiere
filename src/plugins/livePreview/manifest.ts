import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "livePreview",
  title: "Live Preview",
  description: "Live Preview core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
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
