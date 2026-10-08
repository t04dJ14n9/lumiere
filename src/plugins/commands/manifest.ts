import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "commands",
  title: "Commands",
  description: "Commands core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  contributes: {
    commands: [
      {
        id: "save",
        title: "Save",
      },
      {
        id: "undo",
        title: "Undo",
      },
      {
        id: "redo",
        title: "Redo",
      },
      {
        id: "close",
        title: "Close",
      },
      {
        id: "saveClose",
        title: "Save and Close",
      },
      {
        id: "openAsText",
        title: "Open as Text",
      },
    ],
  },
} as const);
