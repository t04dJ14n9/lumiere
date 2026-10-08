import { Schema, defineProtocol } from "../../kernel";
export const offset = new Schema<number>(
  (value) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      throw new Error("Invalid offset");
    return value;
  },
  { type: "integer", minimum: 0 },
);
export const selection = Schema.object({
  from: offset,
  to: offset,
  version: offset,
  text: Schema.string(),
});
export const viewState = Schema.object({
  source: Schema.string().default(""),
  scrollLeft: Schema.number().min(0).default(0),
  scrollAnchor: Schema.object({ from: offset, offset: Schema.number() }).optional(),
  folded: Schema.array(Schema.object({ from: offset, to: offset })).default([]),
  folds: Schema.record(Schema.boolean()).default({}),
  anchor: offset,
  head: offset,
  scrollTop: Schema.number().min(0),
  mode: Schema.union(["source", "livePreview"]),
});
export const protocol = defineProtocol("editor", {
  requests: {
    ready: {
      params: Schema.object({}),
      result: Schema.object({
        text: Schema.string(),
        version: offset,
        clientID: Schema.string(),
        source: Schema.string(),
        preset: Schema.union(["minimal", "obsidian"]),
        mode: Schema.union(["source", "livePreview"]),
      }),
    },
    captureSelection: { params: Schema.object({}), result: selection },
    captureView: { params: Schema.object({}), result: viewState },
    restoreView: { params: viewState, result: Schema.boolean() },
    reveal: {
      params: Schema.object({ from: offset, to: offset, focus: Schema.boolean().default(true) }),
      result: Schema.boolean(),
    },
    clipboardRead: { params: Schema.object({}), result: Schema.string() },
    clipboardWrite: {
      params: Schema.object({ text: Schema.string().max(4_000_000) }),
      result: Schema.boolean(),
    },
  },
  notifications: { selectionChanged: Schema.object({ hasSelection: Schema.boolean() }) },
});
