import { Schema } from "@workshop/core";
import { defineManifest } from "../../shared/manifest";
export const config = Schema.object({
  bilibiliPlayer: Schema.boolean()
    .default(false)
    .description(
      "Offer **Play here** on Bilibili cards in trusted workspaces. Off by default: Bilibili's player does not play inside VS Code's webview.",
    ),
});
export default defineManifest({
  id: "onlineVideos",
  title: "Online Videos",
  description:
    "Show YouTube and Bilibili links embedded as images as video cards, with titles and covers in trusted workspaces.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["host", "webview"],
  capabilities: ["rendering", "network"],
  config,
} as const);
