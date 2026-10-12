import { Schema, defineProtocol } from "../../kernel";
import { MAX_DIFF_CHARS } from "../../shared/diff";
export const baselineResult = Schema.object({
  status: Schema.union(["ok", "untracked", "unavailable", "tooLarge"]),
  text: Schema.string().max(MAX_DIFF_CHARS).optional(),
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
