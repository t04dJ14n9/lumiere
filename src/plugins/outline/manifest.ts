import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "outline",
  title: "Outline",
  description:
    "Outline view of the active note's headings, following the caret. VS Code's own Outline covers the text editor.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  contributes: {
    views: [
      {
        id: "outline",
        name: "Note Outline",
        scope: "workbench",
        when: "activeCustomEditorId == 'markdownWorkbench.editor'",
      },
    ],
  },
} as const);
