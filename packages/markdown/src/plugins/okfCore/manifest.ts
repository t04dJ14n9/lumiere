import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";

export const config = Schema.object({
  bundles: Schema.array(Schema.string().max(1024))
    .max(200)
    .default([])
    .description(
      "Extra OKF bundle roots, relative to the vault. A folder is also a bundle when it contains index.md and a typed concept.",
    ),
});

export default defineManifest({
  id: "okfCore",
  title: "OKF",
  description:
    "Shared Open Knowledge Format bundles, link resolution and resource checks.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host"],
  capabilities: ["vaultIndex"],
  config,
} as const);
