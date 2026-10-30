import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

/** Enough for a large screenshot as base64 (~15 MiB of binary). */
const MAX_BASE64 = 20_000_000;

/**
 * A note's page asks the host to write one attachment and return its embed.
 * The host applies `files.attachmentFolder` and link settings.
 */
export const protocol = defineProtocol("attachments", {
  requests: {
    save: {
      params: Schema.object({
        bytesBase64: Schema.string().max(MAX_BASE64),
        ext: Schema.string().max(32),
      }),
      result: Schema.object({
        ok: Schema.boolean(),
        embed: Schema.string().max(8192).optional(),
        path: Schema.string().max(4096).optional(),
        error: Schema.string().max(512).optional(),
      }),
    },
  },
  notifications: {},
});
