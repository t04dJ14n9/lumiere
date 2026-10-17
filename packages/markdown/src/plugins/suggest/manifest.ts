import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "suggest",
  title: "Suggestions",
  description:
    "Complete links, headings, blocks and tags from the vault index.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["editing", "vaultIndex"],
});
