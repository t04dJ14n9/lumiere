import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "resources",
  title: "Resources",
  description: "Resources core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
} as const);
