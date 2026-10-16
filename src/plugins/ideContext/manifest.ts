import { defineManifest } from "../../shared/manifest";

export default defineManifest({
  id: "ideContext",
  title: "IDE Context for Agents",
  description:
    "Copy or send a deeper IDE-context packet for Claude Code and Codex (clipboard-first; never silent-guess).",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["agentHandoff", "clipboard", "commands"],
  contributes: {
    commands: [
      {
        id: "ideContext.copy",
        title: "Copy IDE Context",
        icon: "$(clippy)",
      },
      {
        id: "ideContext.send",
        title: "Send IDE Context to Agent…",
        icon: "$(comment-discussion)",
      },
    ],
  },
});
