import { Schema, defineProtocol, type Infer } from "../../kernel";
export const query = Schema.object({
  kind: Schema.union(["link", "heading", "block", "tag"]),
  query: Schema.string().max(4096),
  note: Schema.string().max(4096).optional(),
});
export const suggestion = Schema.object({
  replaceLink: Schema.boolean().optional(),
  label: Schema.string().max(8192),
  insert: Schema.string().max(8192),
  detail: Schema.string().max(8192),
});
export type Query = Infer<typeof query>;
export type Suggestion = Infer<typeof suggestion>;
export const protocol = defineProtocol("suggest", {
  requests: {
    query: { params: query, result: Schema.array(suggestion).max(50) },
  },
  notifications: {},
});
