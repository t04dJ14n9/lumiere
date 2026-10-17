import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";

export const config = Schema.object({
  maxLines: Schema.number()
    .min(1)
    .max(6)
    .default(5)
    .description(
      "Maximum pinned heading rows. Keeps the nearest ancestors when the limit is exceeded; fractional values round down. Small editor panes may show fewer rows.",
    ),
});

export default defineManifest({
  id: "stickyScroll",
  title: "Sticky scroll",
  description:
    "Pin ancestor Markdown headings at the top while scrolling in Live Preview and Source mode. Click a pinned heading to return to it.",
  kind: "feature",
  defaultEnabled: false,
  surfaces: ["webview"],
  capabilities: ["editorChrome", "navigation"],
  config,
} as const);
