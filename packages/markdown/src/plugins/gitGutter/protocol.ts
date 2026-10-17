import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
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
    openFullDiff: {
      params: Schema.object({
        baseKind: Schema.union([
          "HEAD",
          "INDEX",
          "WORKTREE",
          "revision",
          "empty",
        ]),
        targetKind: Schema.union([
          "HEAD",
          "INDEX",
          "WORKTREE",
          "revision",
          "empty",
        ]),
      }),
      result: Schema.boolean(),
    },
    mutationLock: {
      params: Schema.object({ hold: Schema.boolean() }),
      result: Schema.boolean(),
    },
  },
  notifications: { changed: Schema.object({}) },
});
