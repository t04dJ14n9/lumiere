import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
export const protocol = defineProtocol("resources", {
  requests: {
    load: {
      params: Schema.object({
        target: Schema.string().max(8192),
        source: Schema.string().max(8192).optional(),
        syntax: Schema.union(["markdown", "wikilink"]).optional(),
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
