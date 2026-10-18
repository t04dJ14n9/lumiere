import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "gitInline",
  title: "Inline git changes",
  description:
    "Track changes in the rendered note: removed words struck through, added words tinted, removed blocks shown with Restore. Needs Git change bars.",
  kind: "feature",
  // Opt in: Lumière: Toggle Inline Git Changes, or this switch.
  defaultEnabled: false,
  surfaces: ["webview"],
  capabilities: ["rendering", "editing"],
} as const);
