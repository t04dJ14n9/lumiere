import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "outgoingLinks",
  title: "Outgoing links",
  description:
    "Outgoing links view: the notes and files the active note links to, and links not created yet.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["host"],
  capabilities: ["vaultIndex", "views", "navigation"],
  contributes: {
    views: [
      { id: "outgoingLinks", name: "Outgoing Links", scope: "workbench" },
    ],
  },
} as const);
