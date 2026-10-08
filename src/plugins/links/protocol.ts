import { Schema, defineProtocol } from "../../kernel";
export const request = Schema.object({
  href: Schema.string().max(8192),
  wiki: Schema.boolean().default(false),
  side: Schema.boolean().default(false),
});
export const protocol = defineProtocol("links", {
  requests: { initial: { params: Schema.object({}), result: Schema.string() }, open: { params: request, result: Schema.boolean() } },
  notifications: { navigate: Schema.string() },
});
