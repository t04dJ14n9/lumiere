import { Schema } from "../../kernel";
export const startup = Schema.object({ query: Schema.string().max(4096) });
export const submission = Schema.object({
  id: Schema.number().min(1),
  document: Schema.object({
    path: Schema.string().max(8192),
    text: Schema.string(),
    kind: Schema.union(["markdown", "canvas", "file"]).optional(),
  }),
});
const ready = Schema.object({
  type: Schema.union(["ready"]),
  files: Schema.boolean(),
});
const failed = Schema.object({
  type: Schema.union(["error"]),
  message: Schema.string(),
});
const matched = Schema.object({
  type: Schema.union(["result"]),
  id: Schema.number().min(1),
  matched: Schema.boolean(),
});
const rejected = Schema.object({
  type: Schema.union(["rejected"]),
  id: Schema.number().min(1),
  message: Schema.string(),
});
export function workerReply(value: unknown) {
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Invalid search reply");
  }
  switch (value.type) {
    case "ready":
      return ready.parse(value);
    case "error":
      return failed.parse(value);
    case "result":
      return matched.parse(value);
    case "rejected":
      return rejected.parse(value);
    default:
      throw new Error("Invalid search reply type");
  }
}
