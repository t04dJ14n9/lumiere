import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "quickSwitcher",
  title: "Quick switcher",
  description:
    "Find a note by name, alias or path, or create it, like Obsidian's quick switcher.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  contributes: {
    commands: [
      { id: "quickSwitcher", title: "Quick Switcher", scope: "workbench" },
    ],
  },
} as const);
