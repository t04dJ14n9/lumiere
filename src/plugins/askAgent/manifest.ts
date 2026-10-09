import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "askAgent",
  title: "Ask Agent",
  description:
    "Ask an agent about selected text, with a saved source line reference.",
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
    ],
    commands: [
      {
        id: "askAgentAboutSelection",
        title: "Ask Agent about Selection",
        icon: "$(comment-discussion)",
        editorCommand: "askAgentAboutSelection",
      },
    ],
  },
});
