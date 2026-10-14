import { runtimePluginStates } from "../../shared/plugin-state";
import { config as editorConfig } from "./manifest";
import { featureSettings } from "../../shared/features";
import { Schema, defineProtocol } from "../../kernel";
export const logRecord = Schema.object({
  level: Schema.union(["debug", "warn", "error"]),
  message: Schema.string().max(8000),
  details: Schema.string().max(8000),
});
export const offset = new Schema<number>(
  (value) => {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error("Invalid offset");
    }
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
const foldRange = new Schema<{ from: number; to: number }>(
  (value) => {
    const range = Schema.object({ from: offset, to: offset }).parse(value);
    if (range.from >= range.to) {
      throw new Error("Invalid fold range");
    }
    return range;
  },
  { type: "object" },
);
export const viewState = Schema.object({
  contributions: Schema.record(Schema.unknown()).default({}),
  source: Schema.string().default(""),
  scrollLeft: Schema.number().min(0).default(0),
  scrollAnchor: Schema.object({
    from: offset,
    offset: Schema.number(),
  }).optional(),
  folded: Schema.array(foldRange).default([]),
  folds: Schema.record(Schema.boolean()).default({}),
  anchor: offset,
  head: offset,
  scrollTop: Schema.number().min(0),
  mode: Schema.union(["source", "livePreview"]),
});
export const protocol = defineProtocol("editor", {
  requests: {
    plugins: { params: Schema.object({}), result: runtimePluginStates },
    ready: {
      params: Schema.object({}),
      result: Schema.object({
        debugLogging: Schema.boolean().default(false),
        text: Schema.string(),
        version: offset,
        clientID: Schema.string(),
        trusted: Schema.boolean().default(false),
        source: Schema.string(),
        features: featureSettings,
        editor: editorConfig.default(editorConfig.parse({})),
        preset: Schema.union(["minimal", "obsidian"]),
        mode: Schema.union(["source", "livePreview"]),
      }),
    },
    captureSelection: { params: Schema.object({}), result: selection },
    captureCursor: {
      params: Schema.object({}),
      result: Schema.object({ head: offset, version: offset }),
    },
    captureView: { params: Schema.object({}), result: viewState },
    restoreView: { params: viewState, result: Schema.boolean() },
    reveal: {
      params: Schema.object({
        from: offset,
        to: offset,
        focus: Schema.boolean().default(true),
        version: offset.optional(),
        navigation: Schema.object({
          session: Schema.string().max(100),
          generation: offset,
        }).optional(),
      }),
      result: Schema.boolean(),
    },
    clipboardRead: { params: Schema.object({}), result: Schema.string() },
    clipboardWrite: {
      params: Schema.object({ text: Schema.string().max(4_000_000) }),
      result: Schema.boolean(),
    },
  },
  notifications: {
    log: logRecord,
    configureLogging: Schema.boolean(),
    pluginsChanged: runtimePluginStates,
    initialized: Schema.object({}),
    configure: featureSettings,
    configureEditor: editorConfig,
    selectionChanged: Schema.object({ hasSelection: Schema.boolean() }),
  },
});
