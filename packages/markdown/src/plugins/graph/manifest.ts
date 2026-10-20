import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";

export const config = Schema.object({
  maxNodes: Schema.number()
    .min(1)
    .max(2000)
    .default(2000)
    .description("Hard cap on notes drawn in the vault graph."),
  maxEdges: Schema.number()
    .min(1)
    .max(20000)
    .default(20000)
    .description("Hard cap on aggregated links drawn in the vault graph."),
  defaultMode: Schema.union(["global", "local"])
    .default("global")
    .description("Open the vault graph in global or local mode."),
  localDepth: Schema.number()
    .min(1)
    .max(3)
    .default(2)
    .description("How many hops the local graph includes."),
  colorBy: Schema.union(["type", "folder", "tag"])
    .default("type")
    .description("Color graph notes by type, folder or first tag."),
});

export default defineManifest({
  id: "graph",
  title: "Vault Graph",
  description:
    "Draw notes as a directed graph (OKF bundle or whole vault) in a panel of its own.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["commands", "vaultIndex", "navigation"],
  config,
  contributes: {
    commands: [
      {
        id: "graph.open",
        title: "Open Vault Graph",
        scope: "workbench",
      },
      {
        id: "graph.chooseBundle",
        title: "Choose Vault Graph Scope",
        scope: "workbench",
      },
    ],
  },
} as const);
