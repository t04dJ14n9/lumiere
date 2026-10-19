import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "publicApi",
  title: "Extension API",
  description: "Versioned host API and isolated external host plugins.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["publicApi", "commands", "clipboard", "navigation"],
  contributes: {
    commands: [
      { id: "managePlugins", title: "Manage Plugins", scope: "workbench" },
      {
        id: "openCopiedAgentReference",
        title: "Open Copied Agent Reference",
        scope: "workbench",
      },
      {
        id: "showPluginStatus",
        title: "Show Plugin Status",
        scope: "workbench",
      },
    ],
  },
} as const);
