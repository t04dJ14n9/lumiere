import { defineManifest } from "../../shared/manifest";

export default defineManifest({
  id: "sourcesProperty",
  title: "Sources",
  description:
    "Show OKF sources as read-only stacked rows and open allowed resources.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "navigation"],
} as const);
