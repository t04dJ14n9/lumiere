import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "gitBlame",
  title: "Current-line authorship",
  description:
    "Shows who last committed the caret line at the end of the line in Live Preview.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  needs: ["git"],
  capabilities: ["editorChrome"],
} as const);
