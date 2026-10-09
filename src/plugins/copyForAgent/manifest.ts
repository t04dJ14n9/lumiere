import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "copyForAgent",
  title: "Copy for Agent",
  description:
    "Copy a saved source line reference or selected text for an agent.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  contributes: {
    menus: [
      {
        command: "askAgentAboutSelection",
        location: "webview/context",
        when: "webviewSection == 'markdownContent' && markdownWorkbench.hasSelection",
        group: "agent",
      },
      {
        command: "copyForAgent",
        location: "webview/context",
        when: "webviewSection == 'markdownContent' && markdownWorkbench.hasSelection",
        group: "agent",
      },
      {
        command: "copyForAgent",
        location: "editor/title",
        when: "markdownWorkbench.hasSelection",
        group: "navigation",
      },
    ],
    commands: [
      {
        id: "askAgentAboutSelection",
        title: "Ask Agent about Selection",
        icon: "$(comment-discussion)",
        editorCommand: "askAgentAboutSelection",
      },
      {
        id: "copyForAgent",
        title: "Copy for Agent",
        icon: "$(copy)",
        editorCommand: "copyForAgent",
        key: "ctrl+alt+c",
        mac: "cmd+alt+c",
      },
    ],
  },
});
