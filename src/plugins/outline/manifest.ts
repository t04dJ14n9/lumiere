import { defineManifest } from "../../shared/manifest";
import { MARKDOWN_EDITOR, whenActive } from "../../shared/editor-provider";
export default defineManifest({
  id: "outline",
  title: "Outline",
  description:
    "Outline view of the active note's headings, following the caret. VS Code's own Outline covers the text editor.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["views", "navigation"],
  contributes: {
    views: [
      {
        id: "outline",
        name: "Note Outline",
        scope: "workbench",
        when: whenActive(MARKDOWN_EDITOR),
      },
    ],
  },
} as const);
