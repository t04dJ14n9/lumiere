import { Schema, type Infer } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
export const result = Schema.object({
  path: Schema.string().max(8192),
  href: Schema.string().max(32768),
});
export const response = Schema.object({
  results: Schema.array(result).max(100000),
  unreadable: Schema.number().min(0),
});
export type SearchResponse = Infer<typeof response>;
export const protocol = defineProtocol("search", {
  requests: {
    query: {
      params: Schema.object({
        query: Schema.string().max(4096),
        source: Schema.string().max(32768),
      }),
      result: response,
    },
  },
  notifications: { changed: Schema.object({}) },
});
