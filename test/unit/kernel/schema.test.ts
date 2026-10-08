import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "../../../src/kernel";
import type { Infer } from "../../../src/kernel";
test("schemas validate every setting type, apply independent defaults and emit JSON Schema", () => {
  const schema = Schema.object({
    enabled: Schema.boolean().default(true),
    count: Schema.number().min(1).max(4),
    name: Schema.string()
      .pattern(/^[a-z]+$/)
      .max(10),
    mode: Schema.union(["source", "livePreview"]),
    items: Schema.array(Schema.string()).max(2).default([]),
    overrides: Schema.record(Schema.boolean()).default({}),
    optional: Schema.string().optional(),
  }).description("Config");
  const input: Infer<typeof schema> = {
    enabled: true,
    count: 2,
    name: "note",
    mode: "source",
    items: [],
    overrides: {},
  };
  assert.deepEqual(schema.parse(input), input);
  const a = schema.parse({ count: 1, name: "a", mode: "source" });
  a.items.push("x");
  assert.deepEqual(schema.parse({ count: 1, name: "a", mode: "source" }).items, []);
  for (const patch of [
    { count: NaN },
    { count: 5 },
    { name: "1" },
    { name: "longlonglong" },
    { mode: "unknown" },
    { items: ["a", "b", "c"] },
    { overrides: { a: 1 } },
    { extra: true },
  ])
    assert.throws(() => schema.parse({ ...input, ...patch }));
  assert.equal(schema.toJSONSchema().additionalProperties, false);
  assert.deepEqual(schema.toJSONSchema().required, ["count", "name", "mode"]);
  assert.equal(schema.toJSONSchema().description, "Config");
});
test("schema errors identify nested paths and record keys cannot pollute prototypes", () => {
  assert.throws(
    () => Schema.object({ entries: Schema.array(Schema.number()) }).parse({ entries: ["bad"] }),
    /\$\.entries\[0\]/,
  );
  const value = Schema.record(Schema.boolean()).parse(JSON.parse('{"__proto__":true}'));
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.hasOwn(value, "__proto__"), true);
});
