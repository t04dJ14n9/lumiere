import { Schema, defineProtocol } from "../../kernel";
export const protocol = defineProtocol("agentBridge", {
  requests: {
    copy: { params: Schema.object({}), result: Schema.boolean() },
  },
  notifications: {},
});
