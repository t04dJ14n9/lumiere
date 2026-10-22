import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
export const action = Schema.union([
  "save",
  "undo",
  "redo",
  "close",
  "saveClose",
  "openAsText",
  "toggleTextEditor",
]);
export const protocol = defineProtocol("commands", {
  requests: {
    action: { params: Schema.object({ action }), result: Schema.boolean() },
    run: {
      params: Schema.object({ command: Schema.string().max(128) }),
      result: Schema.boolean(),
    },
  },
  notifications: {},
});
