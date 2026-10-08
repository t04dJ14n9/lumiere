import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "wordCount",
  title: "Word count",
  description:
    "Word and character count of the active note, or of the selection, in the status bar.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
} as const);
