import { defineManifest } from "../../shared/manifest";

export default defineManifest({
  id: "obsidianMarketplace",
  title: "Obsidian Community Plugins Marketplace",
  description:
    "Browse, install, enable, disable and uninstall Obsidian community plugins in the vault.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["commands", "resourceLoading", "fileWrites", "network"],
  contributes: {
    commands: [
      {
        id: "obsidianMarketplace.open",
        title: "Open Obsidian Community Plugins Marketplace",
        scope: "workbench",
      },
    ],
  },
} as const);
