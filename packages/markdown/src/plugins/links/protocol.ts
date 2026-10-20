import { offset } from "../editor/protocol";
import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
export const navigationTarget = Schema.object({
  fragment: Schema.string().max(8192),
  at: offset.optional(),
});
export const request = Schema.object({
  at: offset.optional(),
  source: Schema.string().max(8192).optional(),
  href: Schema.string().max(8192),
  wiki: Schema.boolean().default(false),
  side: Schema.boolean().default(false),
  /** In a tab of its own (Cmd-click), rather than the current one. */
  tab: Schema.boolean().optional(),
});
export const MAX_UNRESOLVED = 10_000;
export const MAX_KNOWN_NOTES = 150_000;
/** Lower-cased link paths in the note that name no vault file. */
export const unresolvedLinkpaths = Schema.array(Schema.string().max(8192)).max(
  MAX_UNRESOLVED,
);
/** Vault note lookup keys (basename / path / aliases), lower-cased. */
export const knownNoteKeys = Schema.array(Schema.string().max(8192)).max(
  MAX_KNOWN_NOTES,
);
export const protocol = defineProtocol("links", {
  requests: {
    ready: {
      params: Schema.object({ session: Schema.string().max(100) }),
      result: Schema.boolean(),
    },
    navigate: {
      params: Schema.object({
        session: Schema.string().max(100),
        fragment: Schema.string().max(8192),
        at: offset.optional(),
        requestId: offset,
      }),
      result: Schema.boolean(),
    },
    missing: {
      params: Schema.object({ fragment: Schema.string().max(8192) }),
      result: Schema.boolean(),
    },
    open: { params: request, result: Schema.boolean() },
    unresolved: {
      params: Schema.object({
        /** Note URI whose outbound unresolved set to return; host note when omitted. */
        source: Schema.string().max(8192).optional(),
      }),
      result: unresolvedLinkpaths,
    },
    knownNotes: { params: Schema.object({}), result: knownNoteKeys },
  },
  notifications: {
    unresolvedChanged: unresolvedLinkpaths,
    knownNotesChanged: knownNoteKeys,
  },
});
