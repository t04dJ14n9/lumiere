import { Schema, defineProtocol } from "../../kernel";
export const protocol = defineProtocol("resources", {
  requests: {
    load: {
      params: Schema.object({
        target: Schema.string().max(8192),
        source: Schema.string().max(8192).optional(),
      }),
      result: Schema.object({
        kind: Schema.union(["note", "image", "audio", "video", "pdf", "file"]),
        source: Schema.string(),
        url: Schema.string(),
        text: Schema.string().optional(),
      }),
    },
  },
  notifications: {},
});
