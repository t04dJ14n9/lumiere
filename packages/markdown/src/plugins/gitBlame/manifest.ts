import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "gitBlame",
  title: "Current-line authorship",
  description:
    "Shows who last committed the caret line at the end of the line in Live Preview.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["host", "webview"],
  capabilities: ["editorChrome"],
  needs: ["git"],
} as const);
