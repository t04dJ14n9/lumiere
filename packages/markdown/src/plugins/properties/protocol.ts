import { Schema } from "@workshop/core";
import { defineProtocol } from "../../shared/rpc/protocol";
import { propertyKinds } from "../../markdown/properties/types";
const kind = Schema.union(propertyKinds);
export const types = Schema.record(kind);
const snippets = Schema.array(Schema.string().max(500_000)).max(200);
export const protocol = defineProtocol("properties", {
  requests: {
    types: { params: Schema.object({}), result: types },
    names: {
      params: Schema.object({}),
      result: Schema.array(Schema.string().max(255)).max(50_000),
    },
    collapsed: { params: Schema.object({}), result: Schema.boolean() },
    setCollapsed: {
      params: Schema.object({ collapsed: Schema.boolean() }),
      result: Schema.boolean(),
    },
    setType: {
      params: Schema.object({
        key: Schema.string().max(255),
        kind: kind.optional(),
      }),
      result: types,
    },
    snippets: {
      params: Schema.object({}),
      result: snippets,
    },
  },
  notifications: {
    types: types,
    collapsed: Schema.boolean(),
    snippets: snippets,
  },
});
