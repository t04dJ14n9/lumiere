import { defineManifest } from "../../shared/manifest";

export default defineManifest({
  id: "wiki",
  title: "Wiki",
  description:
    "Read a project's .wiki layout and copy a reference for an agent. This does not run an agent or create folders.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["commands", "clipboard"],
  contributes: {
    commands: [
      {
        id: "wiki.copyForAgent",
        title: "Copy Wiki Reference for Agent",
        scope: "workbench",
      },
      {
        id: "wiki.copyEnvelope",
        title: "Copy Wiki Bridge Envelope",
        scope: "workbench",
      },
      {
        id: "wiki.showLayout",
        title: "Show Wiki Layout",
        scope: "workbench",
      },
      {
        id: "wiki.refresh",
        title: "Refresh Wiki Diagnostics",
        scope: "workbench",
      },
    ],
  },
} as const);
