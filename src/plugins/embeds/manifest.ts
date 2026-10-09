import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "embeds",
  title: "Embeds",
  description: "Transclude notes, images and media; open attachment cards.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
  capabilities: ["rendering", "vaultIndex", "resourceLoading", "commands"],
  contributes: {
    commands: [
      {
        id: "insertEmbed",
        title: "Insert Embed",
        editorCommand: "editor:insert-embed",
      },
    ],
  },
});
