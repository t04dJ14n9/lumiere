import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "footnotes",
  title: "Footnotes",
  description: "Footnote references, definitions, previews and navigation.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["syntax", "rendering", "navigation", "commands"],
  contributes: {
    commands: [
      {
        id: "insertFootnote",
        title: "Insert Footnote",
        editorCommand: "editor:insert-footnote",
      },
    ],
  },
});
