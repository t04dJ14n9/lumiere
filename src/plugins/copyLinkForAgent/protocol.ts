import { Schema, defineProtocol } from "../../kernel";
export const protocol = defineProtocol("copyLinkForAgent", {
  requests: {
    copy: { params: Schema.object({}), result: Schema.boolean() },
  },
  notifications: {},
});
