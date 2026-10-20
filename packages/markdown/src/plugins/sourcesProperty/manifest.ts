import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";

/** Shares `lumiere.markdown.properties.listPreviewCount` with Properties. */
export const config = Schema.object({
  listPreviewCount: Schema.number().min(1).max(50).default(3),
});

export default defineManifest({
  id: "sourcesProperty",
  title: "Sources",
  description:
    "Show OKF sources as stacked rows with open links (typed Properties UI).",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "navigation"],
  config,
  configKeys: {
    listPreviewCount: "properties.listPreviewCount",
  },
} as const);
