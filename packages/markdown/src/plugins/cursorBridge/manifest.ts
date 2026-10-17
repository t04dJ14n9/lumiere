import { defineManifest } from "../../shared/manifest";

const bridgeWhen =
  "markdownWorkshop.isCursorHost && markdownWorkshop.hasSelection";

export default defineManifest({
  id: "cursorBridge",
  title: "Cursor Chat and Edit",
  description:
    "In Cursor, Cmd/Ctrl+L opens Chat and Cmd/Ctrl+K opens Edit on the Live Preview selection.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["commands", "agentHandoff"],
  contributes: {
    commands: [
      {
        id: "cursorBridge.chat",
        title: "Cursor Chat with Selection",
        key: "ctrl+l",
        mac: "cmd+l",
        when: bridgeWhen,
      },
      {
        id: "cursorBridge.edit",
        title: "Cursor Edit Selection",
        key: "ctrl+k",
        mac: "cmd+k",
        when: bridgeWhen,
      },
    ],
  },
});
