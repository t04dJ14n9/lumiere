import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

/** Enough for a large screenshot as base64 (~15 MiB of binary). */
const MAX_BASE64 = 20_000_000;

const saveResult = Schema.object({
  ok: Schema.boolean(),
  embed: Schema.string().max(8192).optional(),
  path: Schema.string().max(4096).optional(),
  error: Schema.string().max(512).optional(),
});

/**
 * A note's page asks the host to write one attachment and return its embed.
 * The host applies `files.attachmentFolder` and link settings.
 *
 * `save` takes bytes from the webview (clipboard / File / data URI).
 * `importUrl` loads http(s) or file:// on the host — webview CSP blocks fetch.
 */
export const protocol = defineProtocol("attachments", {
  requests: {
    save: {
      params: Schema.object({
        bytesBase64: Schema.string().max(MAX_BASE64),
        ext: Schema.string().max(32),
      }),
      result: saveResult,
    },
    importUrl: {
      params: Schema.object({
        url: Schema.string().max(8192),
      }),
      result: saveResult,
    },
  },
  notifications: {},
});
