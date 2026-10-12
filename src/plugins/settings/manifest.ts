import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "settings",
  title: "Settings commands",
  description:
    "Open the extension's settings and change the common ones from the command palette.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["commands"],
  contributes: {
    commands: [
      { id: "openSettings", title: "Open Settings", scope: "workbench" },
      { id: "changeSetting", title: "Change Setting…", scope: "workbench" },
      {
        id: "setNoteFontSize",
        title: "Set Note Font Size",
        scope: "workbench",
      },
      {
        id: "toggleLineNumbers",
        title: "Toggle Line Numbers",
        scope: "workbench",
      },
      {
        id: "toggleReadableLineWidth",
        title: "Toggle Readable Line Width",
        scope: "workbench",
      },
      {
        id: "toggleMermaid",
        title: "Toggle Mermaid Diagrams",
        scope: "workbench",
      },
      {
        id: "toggleInlineTitle",
        title: "Toggle Inline Title",
        scope: "workbench",
      },
      {
        id: "toggleInlineGitChanges",
        title: "Toggle Inline Git Changes",
        scope: "workbench",
      },
      { id: "toggleVim", title: "Toggle Vim Mode", scope: "workbench" },
    ],
  },
} as const);
