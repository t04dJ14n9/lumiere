import { Schema, defineProtocol } from "../../kernel";
import { offset } from "../editor/protocol";
export const marker = Schema.object({
  id: Schema.string().min(1).max(256),
  from: offset,
  to: offset,
  documentVersion: offset,
  label: Schema.string().min(1).max(120),
  tooltip: Schema.string().max(1000).optional(),
  actionId: Schema.string().min(1).max(256).optional(),
});
export const snapshot = Schema.object({
  version: offset,
  revision: offset,
  owners: Schema.record(Schema.array(marker).max(1000)),
});
export const protocol = defineProtocol("markers", {
  requests: {
    current: { params: Schema.object({}), result: snapshot },
    activate: {
      params: Schema.object({
        owner: Schema.string().min(1).max(256),
        markerId: Schema.string().min(1).max(256),
      }),
      result: Schema.boolean(),
    },
  },
  notifications: { changed: snapshot },
});
