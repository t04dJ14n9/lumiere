import { Schema, defineProtocol } from "../../kernel";
export const protocol = defineProtocol("copyForAgent", {
  requests: {
    ask: { params: Schema.object({}), result: Schema.boolean() },
  },
  notifications: {},
});
