import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "@workshop/core";
import type { Infer } from "@workshop/core";
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
  assert.deepEqual(
    schema.parse({ count: 1, name: "a", mode: "source" }).items,
    [],
  );
  for (const patch of [
    { count: NaN },
    { count: 5 },
    { name: "1" },
    { name: "longlonglong" },
    { mode: "unknown" },
    { items: ["a", "b", "c"] },
    { overrides: { a: 1 } },
    { extra: true },
  ]) {
    assert.throws(() => schema.parse({ ...input, ...patch }));
  }
  assert.equal(schema.toJSONSchema().additionalProperties, false);
  assert.deepEqual(schema.toJSONSchema().required, ["count", "name", "mode"]);
  assert.equal(schema.toJSONSchema().description, "Config");
});
test("schema errors identify nested paths and record keys cannot pollute prototypes", () => {
  assert.throws(
    () =>
      Schema.object({ entries: Schema.array(Schema.number()) }).parse({
        entries: ["bad"],
      }),
    /\$\.entries\[0\]/,
  );
  const value = Schema.record(Schema.boolean()).parse(
    JSON.parse('{"__proto__":true}'),
  );
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.hasOwn(value, "__proto__"), true);
});

test("schema bounds keep numeric, array and string measurement and JSON keywords aligned", () => {
  for (const [schema, lower, upper, valid, short, long] of [
    [Schema.number().min(2).max(3), "minimum", "maximum", 2, 1, 4],
    [
      Schema.array(Schema.string()).min(2).max(3),
      "minItems",
      "maxItems",
      ["a", "b"],
      ["a"],
      ["a", "b", "c", "d"],
    ],
    [
      Schema.string().min(2).max(3),
      "minLength",
      "maxLength",
      "ab",
      "a",
      "abcd",
    ],
  ] as const) {
    assert.deepEqual(schema.parse(valid), valid);
    assert.throws(() => schema.parse(short));
    assert.throws(() => schema.parse(long));
    assert.equal(schema.toJSONSchema()[lower], 2);
    assert.equal(schema.toJSONSchema()[upper], 3);
  }
  assert.throws(() => Schema.unknown().min(1).parse({ length: 2 }));
  assert.throws(() => Schema.unknown().max(3).parse(true));
});
