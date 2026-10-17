import { defineManifest } from "../manifest";

export default defineManifest({
  id: "agentBridge",
  title: "Agent Bridge",
  capabilities: ["agentHandoff", "commands", "localServer"],
});
