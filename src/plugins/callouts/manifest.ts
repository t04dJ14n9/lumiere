import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "callouts",
  title: "Callouts",
  description: "Render callouts and remember their disclosure state per panel.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  contributes: {
    commands: [
      {
        id: "insertCallout",
        title: "Insert Callout",
        editorCommand: "editor:insert-callout",
      },
    ],
  },
});
