import { Schema } from "@workshop/core";

const side = Schema.object({
  uri: Schema.string(),
  label: Schema.string(),
  text: Schema.string(),
});
export const diffUpdate = Schema.object({
  type: Schema.union(["update"]),
  left: side,
  right: side,
});
export const diffImageRequest = Schema.object({
  type: Schema.union(["image"]),
  id: Schema.number().min(0),
  side: Schema.union(["left", "right"]),
  target: Schema.string(),
});
export const diffImageReply = Schema.object({
  type: Schema.union(["image"]),
  id: Schema.number().min(0),
  url: Schema.string(),
});

export function parseDiffMessage<T>(
  schema: Schema<T>,
  message: unknown,
): T | undefined {
  try {
    return schema.parse(message);
  } catch {
    return undefined;
  }
}

export const diffReady = Schema.object({ type: Schema.union(["ready"]) });
export const diffAction = Schema.object({
  type: Schema.union(["action"]),
  action: Schema.union(["openFile", "openNative"]),
});
