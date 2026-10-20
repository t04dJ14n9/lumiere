import { Schema, type Infer } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
export const matchLine = Schema.object({
  text: Schema.string().max(512),
  offset: Schema.number().min(0),
  mark: Schema.object({
    from: Schema.number().min(0),
    to: Schema.number().min(0),
  }).optional(),
});
export const result = Schema.object({
  path: Schema.string().max(8192),
  href: Schema.string().max(32768),
  /** Content lines under the file (Obsidian search-result-file-match). */
  matches: Schema.array(matchLine).max(100).optional(),
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
        /** Correlates partial notifications with this request; omit to skip streaming. */
        id: Schema.string().min(1).max(64).optional(),
      }),
      result: response,
    },
  },
  notifications: {
    changed: Schema.object({}),
    /** Accumulated matches so far for an in-flight `query` (Obsidian streams results). */
    partial: Schema.object({
      id: Schema.string().min(1).max(64),
      results: Schema.array(result).max(100000),
      unreadable: Schema.number().min(0),
    }),
  },
});
