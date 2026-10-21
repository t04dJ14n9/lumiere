import { Schema } from "@workshop/core";
import type { Infer } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
export const videoDetails = Schema.object({
  title: Schema.string().max(300).optional(),
  author: Schema.string().max(100).optional(),
  /** Length in seconds. */
  duration: Schema.number().min(0).max(1_000_000).optional(),
  /** A `data:image/…;base64,` cover fetched by the host. */
  cover: Schema.string().max(1_000_000).optional(),
});
export type VideoDetails = Infer<typeof videoDetails>;
export const protocol = defineProtocol("onlineVideos", {
  requests: {
    details: {
      params: Schema.object({
        provider: Schema.union([
          "youtube",
          "bilibili",
          "huggingface",
          "spotify",
          "soundcloud",
          "npm",
        ]),
        /**
         * SoundCloud ids are `user/sets/slug` (up to 256 chars). Hugging Face
         * model ids are at most 200; npm package names at most 214.
         */
        id: Schema.string().max(300),
        kind: Schema.union([
          "video",
          "playlist",
          "bangumi",
          "channel",
          "space",
        ]).default("video"),
        /** Bilibili multi-part index (`?p=`), 1-based. */
        part: Schema.number().min(1).max(10_000).optional(),
      }),
      result: videoDetails,
    },
  },
  notifications: {},
});
