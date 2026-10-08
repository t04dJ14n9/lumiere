import { Schema, defineProtocol } from "../../kernel";
import { offset } from "../editor/protocol";
export const protocol = defineProtocol("tasks", {
  requests: { toggle: { params: Schema.object({ source: Schema.string().max(8192).optional(),
    line: offset, expected: Schema.string().max(1_000_000), checked: Schema.boolean() }), result: Schema.boolean() } },
  notifications: {},
});
