import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

/**
 * A note's page and the sketch host. The page only says which embed was
 * tapped; the host resolves it in the vault, opens the canvas and saves.
 */
export const protocol = defineProtocol("sketch", {
  requests: {
    /** Whether this host can draw; a host without a canvas never answers. */
    available: { params: Schema.object({}), result: Schema.boolean() },
    /**
     * Edit the sketch an embed in the note shows, by its link as written.
     * True once the new drawing is saved.
     */
    edit: {
      params: Schema.object({
        target: Schema.string().max(8192),
        syntax: Schema.union(["markdown", "wikilink"]),
      }),
      result: Schema.boolean(),
    },
  },
  notifications: {
    /** The host can draw: sent when it starts after the page did. */
    ready: Schema.object({}),
  },
});
