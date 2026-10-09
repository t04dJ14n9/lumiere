import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "tasks",
  title: "Tasks",
  description: "Interactive checkboxes and checklist commands.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "editing", "commands"],
  contributes: {
    commands: [
      {
        id: "toggleChecklist",
        title: "Toggle Checklist Status",
        editorCommand: "editor:toggle-checklist-status",
      },
      {
        id: "cycleListChecklist",
        title: "Cycle List Checklist",
        editorCommand: "editor:cycle-list-checklist",
      },
    ],
  },
});
