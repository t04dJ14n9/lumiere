import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "footnotes", title: "Footnotes", description: "Footnote references, definitions, previews and navigation.",
  kind: "feature", defaultEnabled: true, surfaces: ["webview"],
  contributes: { commands: [{ id: "insertFootnote", title: "Insert Footnote", editorCommand: "editor:insert-footnote" }] },
});
