import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";

export const protocol = defineProtocol("sourcesProperty", {
  requests: {
    open: {
      params: Schema.object({
        resource: Schema.string().max(4096),
      }),
      result: Schema.object({ opened: Schema.boolean() }),
    },
  },
  notifications: {},
});
