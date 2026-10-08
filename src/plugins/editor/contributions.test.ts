import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import { Schema } from "../../kernel";
import { ViewContributions } from "./contributions";

test("late view-state contributors restore validated data and carry unknown keys", async () => {
  const contributions = new ViewContributions({} as EditorView);
  contributions.restore({ future: { version: 2 }, count: 4 }, "old.md");
  let count = 0;
  const remove = contributions.contribute("count", {
    schema: Schema.number(),
    capture: () => count,
    restore(_view, value, source) {
      assert.equal(source, "old.md");
      count = value;
    },
  });
  assert.equal(count, 4);
  count = 7;
  assert.deepEqual(contributions.capture(), {
    count: 7,
    future: { version: 2 },
  });
  await remove();
  count = 99;
  assert.deepEqual(contributions.capture(), {
    count: 7,
    future: { version: 2 },
  });
  contributions.contribute("count", {
    schema: Schema.number(),
    capture: () => count,
    restore: (_view, value) => {
      count = value;
    },
  });
  assert.equal(count, 7);
});

test("invalid contribution data is ignored independently; legacy keys restore on late registration", () => {
  const contributions = new ViewContributions({} as EditorView);
  contributions.restore({ count: "bad", other: true }, "old.md", { legacy: 5 });
  let count = 0;
  contributions.contribute("count", {
    schema: Schema.number(),
    capture: () => count,
    restore: (_view, value) => {
      count = value;
    },
  });
  assert.equal(count, 0);
  contributions.contribute("legacy", {
    schema: Schema.number(),
    capture: () => count,
    restore: (_view, value) => {
      count = value;
    },
  });
  assert.equal(count, 5);
  assert.equal(contributions.capture().other, true);
  assert.throws(
    () =>
      contributions.contribute("count", {
        schema: Schema.number(),
        capture: () => 0,
        restore() {},
      }),
    /Duplicate/,
  );
});
