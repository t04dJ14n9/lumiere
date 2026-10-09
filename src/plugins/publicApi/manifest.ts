import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "publicApi",
  title: "Extension API",
  description: "Versioned host API and isolated external host plugins.",
  kind: "core",
  defaultEnabled: true,
  surfaces: ["host"],
});
