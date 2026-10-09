import { defineManifest } from "../../shared/manifest";
// The id stays `copyForAgent` so `markdownWorkbench.plugins.copyForAgent.enabled`
// and the public API's `copyForAgent` keep working for existing users.
export default defineManifest({
  id: "copyForAgent",
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
