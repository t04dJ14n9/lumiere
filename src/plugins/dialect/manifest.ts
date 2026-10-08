import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "dialect",
  title: "Markdown Dialect",
  description: "Markdown Dialect core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  contributes: {
    commands: [],
  },
} as const);
