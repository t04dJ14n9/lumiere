import { ChangeSet } from "@codemirror/state";
import { Schema, defineProtocol } from "../../kernel";
const change = new Schema<unknown[]>(
  (value) => {
    ChangeSet.fromJSON(value);
    return value as unknown[];
  },
  { type: "array" },
);
const version = new Schema<number>(
  (v) => {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
      throw new Error("Invalid version");
    return v;
  },
  { type: "integer", minimum: 0 },
);
export const updates = Schema.object({
  version,
  updates: Schema.array(Schema.object({ clientID: Schema.string().max(128), changes: change })),
});
export const protocol = defineProtocol("document", {
  requests: {
    push: {
      params: Schema.object({
        version,
        changes: Schema.array(change).max(512),
        group: Schema.string().max(128).optional(),
      }),
      result: Schema.boolean(),
    },
    flush: { params: Schema.object({}), result: Schema.boolean() },
  },
  notifications: { updates },
});
