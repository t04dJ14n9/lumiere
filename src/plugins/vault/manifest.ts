import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "vault",
  title: "Vault",
  description: "Vault core service.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host"],
} as const);
