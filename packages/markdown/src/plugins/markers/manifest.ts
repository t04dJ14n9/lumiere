import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "markers",
  title: "Source markers",
  description: "Source-bound badges and actions supplied by plugins.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering"],
});
