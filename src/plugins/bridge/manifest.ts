import { defineManifest } from "../../shared/manifest";

export default defineManifest({
  id: "bridge",
  title: "Bridge",
  description:
    "Build a versioned selection envelope for an agent. Agent PDF Viewer is used when it is installed. This does not open a chat.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["commands", "clipboard", "agentHandoff"],
  contributes: {
    commands: [
      {
        id: "bridge.copyEnvelope",
        title: "Copy Bridge Envelope",
        scope: "workbench",
      },
      {
        id: "bridge.envelope",
        title: "Bridge Envelope",
        scope: "workbench",
        palette: false,
      },
    ],
  },
} as const);
