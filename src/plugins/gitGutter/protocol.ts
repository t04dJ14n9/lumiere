import { Schema, defineProtocol } from "../../kernel";
export const baselineResult = Schema.object({
  status: Schema.union(["ok", "untracked", "unavailable"]),
  text: Schema.string().max(50_000_000).optional(),
  label: Schema.string().max(200).optional(),
});
export const protocol = defineProtocol("gitGutter", {
  requests: {
    baseline: {
      params: Schema.object({ ref: Schema.union(["HEAD", "index"]) }),
      result: baselineResult,
    },
    stage: { params: Schema.object({}), result: Schema.boolean() },
  },
  notifications: { changed: Schema.object({}) },
});
