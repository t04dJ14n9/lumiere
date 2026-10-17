import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import { Schema } from "@workshop/core";
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

test("disposing one contribution preserves its snapshot without reading it again or affecting another", async () => {
  const contributions = new ViewContributions({} as EditorView);
  let first = 1;
  let second = 2;
  let captures = 0;
  const stop = contributions.contribute("first", {
    schema: Schema.number(),
    capture: () => {
      captures++;
      return first;
    },
    restore: (_view, value) => {
      first = value;
    },
  });
  contributions.contribute("second", {
    schema: Schema.number(),
    capture: () => second,
    restore: (_view, value) => {
      second = value;
    },
  });
  await stop();
  await stop();
  first = 99;
  assert.deepEqual(contributions.capture(), { first: 1, second: 2 });
  assert.equal(captures, 1);
  // A present invalid value must not silently fall back to a legacy value.
  contributions.restore({ second: null }, "note.md", { second: 8 });
  assert.equal(second, 2);
});
