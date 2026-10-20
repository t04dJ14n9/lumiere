/**
 * Cross-plugin surface for Online Videos. Other plugins may import only this
 * file (and manifest/protocol), not internal modules like parse.ts.
 */
export {
  parseVideoUrl,
  isVideoId,
  type OnlineVideo,
  type VideoProvider,
} from "./parse";
