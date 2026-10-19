import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
export const protocol = defineProtocol("agentBridge", {
  requests: {
    copy: { params: Schema.object({}), result: Schema.boolean() },
  },
  notifications: {},
});
