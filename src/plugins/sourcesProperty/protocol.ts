import { Schema, defineProtocol } from "../../kernel";

export const protocol = defineProtocol("sourcesProperty", {
  requests: {
    open: {
      params: Schema.object({
        resource: Schema.string().max(4096),
      }),
      result: Schema.object({ opened: Schema.boolean() }),
    },
    copy: {
      params: Schema.object({ text: Schema.string().max(1024) }),
      result: Schema.object({ copied: Schema.boolean() }),
    },
  },
  notifications: {},
});
