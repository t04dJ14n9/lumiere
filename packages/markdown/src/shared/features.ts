import { Schema } from "@workshop/core";
export const featureSettings = Schema.record(
  Schema.object({
    enabled: Schema.boolean(),
    config: Schema.record(Schema.unknown()).default({}),
  }),
).default({});
