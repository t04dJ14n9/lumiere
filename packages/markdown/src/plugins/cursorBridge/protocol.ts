import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

/**
 * Cursor Chat and Edit from the editor: the webview claims Cmd/Ctrl+L and
 * Cmd/Ctrl+K in capture phase, because Cursor's own bindings outrank any
 * extension's and the webview shell would otherwise forward them.
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
