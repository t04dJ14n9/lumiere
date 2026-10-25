import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

const baseNoteEntrySchema = Schema.object({
  path: Schema.string(),
  basename: Schema.string(),
  extension: Schema.string(),
  mtime: Schema.number(),
  size: Schema.number(),
  frontmatter: Schema.record(Schema.unknown()).optional(),
  tags: Schema.array(Schema.string()),
  links: Schema.array(Schema.string()),
  embeds: Schema.array(Schema.string()),
  backlinks: Schema.array(Schema.string()),
});

export const protocol = defineProtocol("resources", {
  requests: {
    load: {
      params: Schema.object({
        target: Schema.string().max(8192),
        source: Schema.string().max(8192).optional(),
        syntax: Schema.union(["markdown", "wikilink"]).optional(),
      }),
      result: Schema.object({
        kind: Schema.union([
          "note",
          "base",
          "image",
          "audio",
          "video",
          "pdf",
          "file",
        ]),
        source: Schema.string(),
        url: Schema.string(),
        text: Schema.string().optional(),
        entries: Schema.array(baseNoteEntrySchema).optional(),
        thisEntry: baseNoteEntrySchema.optional(),
      }),
    },
  },
  notifications: {},
});
