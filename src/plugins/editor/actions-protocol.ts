import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
export const action = Schema.object({
  owner: Schema.string().min(1).max(256),
  id: Schema.string().min(1).max(256),
  label: Schema.string().min(1).max(120),
  scope: Schema.union(["selection", "title"]),
});
export const protocol = defineProtocol("editorActions", {
  requests: {
    current: {
      params: Schema.object({}),
      result: Schema.array(action).max(1000),
    },
    run: {
      params: Schema.object({
        owner: Schema.string().min(1).max(256),
        id: Schema.string().min(1).max(256),
      }),
      result: Schema.boolean(),
    },
  },
  notifications: { changed: Schema.array(action).max(1000) },
});
