import { defineManifest } from "../../shared/manifest";
export default defineManifest({
  id: "onlineVideos",
  title: "Online Videos",
  description:
    "Show YouTube and Bilibili links embedded as images as video cards, with a player where the provider allows it.",
  kind: "feature",
  defaultEnabled: true,
  surfaces: ["webview"],
});
