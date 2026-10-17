import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
import { offset } from "./protocol";
export const jumpAnchor = Schema.object({
  selection: Schema.object({ anchor: offset, head: offset }),
  scroll: Schema.object({
    from: offset,
    offset: Schema.number(),
    left: Schema.number().min(0),
    top: Schema.number().min(0),
  }),
});
export const protocol = defineProtocol("editorJumps", {
  notifications: {},
  requests: {
    navigationState: {
      params: Schema.object({}),
      result: Schema.object({
        session: Schema.string().max(100),
        generation: offset,
      }),
    },
    record: {
      params: Schema.object({
        before: jumpAnchor,
        after: jumpAnchor,
        version: offset,
      }),
      result: Schema.boolean(),
    },
    capture: {
      params: Schema.object({}),
      result: Schema.object({
        anchor: jumpAnchor,
        version: offset,
        generation: offset,
        startedAttempt: offset.optional(),
        session: Schema.string().max(100),
      }),
    },
    restore: {
      params: Schema.object({
        attempt: offset.optional(),
        anchor: jumpAnchor,
        version: offset,
        generation: offset,
        session: Schema.string().max(100),
      }),
      result: Schema.boolean(),
    },
  },
});
