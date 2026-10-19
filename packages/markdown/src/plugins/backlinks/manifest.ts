import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "backlinks",
  title: "Backlinks",
  description:
    "Backlinks view and status bar count for the active note, with unlinked mentions.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["host"],
  capabilities: ["vaultIndex", "views", "statusBar", "navigation"],
  contributes: {
    views: [{ id: "backlinks", name: "Backlinks", scope: "workbench" }],
  },
} as const);
