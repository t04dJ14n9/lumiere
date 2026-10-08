import { Schema, defineProtocol } from "../../kernel";
import { propertyKinds } from "../../markdown/properties/types";
const kind = Schema.union(propertyKinds);
export const types = Schema.record(kind);
export const protocol = defineProtocol("properties", {
  requests: {
    types: { params: Schema.object({}), result: types },
    setType: {
      params: Schema.object({
        key: Schema.string().max(255),
        kind: kind.optional(),
      }),
      result: types,
    },
  },
  notifications: { types: types },
});
