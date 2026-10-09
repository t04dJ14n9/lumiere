import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "publicApi",
  title: "Extension API",
  description: "Versioned host API and isolated external host plugins.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host"],
  contributes: {
    commands: [
      { id: "managePlugins", title: "Manage Plugins", scope: "workbench" },
      {
        id: "showPluginStatus",
        title: "Show Plugin Status",
        scope: "workbench",
      },
    ],
  },
} as const);
