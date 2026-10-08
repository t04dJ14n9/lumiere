import { offset } from "../editor/protocol";
import { Schema, defineProtocol } from "../../kernel";
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
});
export const MAX_UNRESOLVED = 10_000;
/** Lower-cased link paths in the note that name no vault file. */
export const unresolvedLinkpaths = Schema.array(Schema.string().max(8192)).max(
  MAX_UNRESOLVED,
);
export const protocol = defineProtocol("links", {
  requests: {
    initial: { params: Schema.object({}), result: navigationTarget },
    open: { params: request, result: Schema.boolean() },
    unresolved: { params: Schema.object({}), result: unresolvedLinkpaths },
  },
  notifications: {
    navigate: navigationTarget,
    unresolvedChanged: unresolvedLinkpaths,
  },
});
