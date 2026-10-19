import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
import { validTag } from "../../markdown/tags/grammar";
export const tagName = new Schema<string>(
  (value) => {
    if (!validTag(value)) {
      throw new Error("Invalid tag");
    }
    return value;
  },
  { type: "string", maxLength: 1024 },
);
export const protocol = defineProtocol("tags", {
  requests: {
    search: {
      params: Schema.object({ tag: tagName }),
      result: Schema.boolean(),
    },
  },
  notifications: {},
});
