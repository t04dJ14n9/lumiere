import { Schema, ValidationError } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
import { MAX_DIFF_CHARS } from "../../shared/diff";
import type { GitBlameLineResult } from "../../shared/git-blame";

const integer = new Schema<number>(
  (value, path) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw new ValidationError(path, "expected safe integer");
    }
    return value;
  },
  { type: "integer" },
);

const version = new Schema<number | string>(
  (value, path) => {
    return typeof value === "number"
      ? integer.min(0).at(value, path)
      : Schema.string().max(128).at(value, path);
  },
  {
    oneOf: [
      { type: "integer", minimum: 0 },
      { type: "string", maxLength: 128 },
    ],
  },
);

const blameOk = Schema.object({
  commit: Schema.string().max(128),
  shortCommit: Schema.string().max(16),
  authorName: Schema.string().max(200),
  authorEmail: Schema.string().max(320),
  authorDate: integer,
  subject: Schema.string().max(500),
  body: Schema.string().max(8000).optional(),
  committerDate: integer.optional(),
  line: integer.min(1),
  boundary: Schema.boolean().optional(),
});
const resultFields = Schema.object({
  status: Schema.union([
    "ok",
    "uncommitted",
    "untracked",
    "unavailable",
    "empty",
    "stale",
  ]),
  blame: blameOk.optional(),
  repoGeneration: integer.min(0),
});
const blameResult = new Schema<GitBlameLineResult>((value, path) => {
  const result = resultFields.at(value, path);
  if (result.status === "ok") {
    if (!result.blame) {
      throw new ValidationError(path, "ok requires blame");
    }
    return {
      status: "ok",
      blame: result.blame,
      repoGeneration: result.repoGeneration,
    };
  }
  return { status: result.status, repoGeneration: result.repoGeneration };
}, resultFields.toJSONSchema());

export const protocol = defineProtocol("gitBlame", {
  requests: {
    blameLine: {
      params: Schema.object({
        line: integer.min(1),
        contents: Schema.string().max(MAX_DIFF_CHARS),
        version,
      }),
      result: blameResult,
    },
    identity: {
      params: Schema.object({}),
      result: Schema.object({
        userName: Schema.string().max(200).optional(),
        userEmail: Schema.string().max(320).optional(),
      }).optional(),
    },
  },
  notifications: { changed: Schema.object({ repoGeneration: integer.min(0) }) },
});
