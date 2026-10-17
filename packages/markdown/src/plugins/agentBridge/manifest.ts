import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "agentBridge",
  title: "Copy Link for Agent",
  description:
    "Copy selected text with a link to its saved source lines, for an agent.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["agentHandoff", "clipboard", "commands"],
  contributes: {
    menus: [
      {
        command: "copyLinkForAgent",
        location: "webview/context",
        when: "webviewSection == 'markdownContent' && markdownWorkshop.hasSelection",
        group: "agent",
      },
    ],
    commands: [
      {
        id: "copyLinkForAgent",
        title: "Copy Link for Agent",
        icon: "$(comment-discussion)",
        editorCommand: "copyLinkForAgent",
      },
    ],
  },
});
