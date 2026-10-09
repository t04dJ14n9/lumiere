import { Schema, defineProtocol } from "../../kernel";
export const protocol = defineProtocol("copyForAgent", {
  requests: {
    copy: { params: Schema.object({}), result: Schema.boolean() },
    ask: { params: Schema.object({}), result: Schema.boolean() },
  },
  notifications: {},
});
