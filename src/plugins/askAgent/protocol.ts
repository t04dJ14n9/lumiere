import { Schema, defineProtocol } from "../../kernel";
export const protocol = defineProtocol("askAgent", {
  requests: {
    ask: { params: Schema.object({}), result: Schema.boolean() },
  },
  notifications: {},
});
