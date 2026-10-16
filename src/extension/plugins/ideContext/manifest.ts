import { defineManifest } from "../../runtime/manifest";

export default defineManifest({
  id: "ideContext",
  title: "IDE Context",
  capabilities: ["agentHandoff", "commands"],
  requires: ["pdf"],
  optional: ["pdfRegions", "agentBridge"],
});
