import { Schema, defineProtocol } from "../../kernel";
import type { Infer } from "../../kernel";
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
        provider: Schema.union(["youtube", "bilibili"]),
        id: Schema.string().max(32),
      }),
      result: videoDetails,
    },
  },
  notifications: {},
});
