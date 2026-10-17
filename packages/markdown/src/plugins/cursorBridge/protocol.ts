import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

/**
 * Cursor Chat and Edit from the editor: the webview catches Cmd/Ctrl+L and
 * Cmd/Ctrl+K itself, because Cursor's own bindings for those keys outrank
 * any extension's.
 */
export const protocol = defineProtocol("cursorBridge", {
  requests: {
    /** Whether the editor runs in Cursor. */
    isCursor: { params: Schema.object({}), result: Schema.boolean() },
    /** Hand the selection to Cursor Chat or Edit. */
    handOff: {
      params: Schema.object({ mode: Schema.union(["chat", "edit"]) }),
      result: Schema.boolean(),
    },
  },
  notifications: {},
});
