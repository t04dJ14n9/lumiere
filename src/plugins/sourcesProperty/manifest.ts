import { defineManifest } from "../../shared/manifest";

export default defineManifest({
  id: "sourcesProperty",
  title: "Sources",
  description:
    "Show OKF sources with open links; values edit as YAML beside other Properties.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "navigation"],
} as const);
