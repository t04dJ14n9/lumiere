import test from "node:test";
import assert from "node:assert/strict";
import {
  frontmatter,
  propertyChanges,
  type PropertyEdit,
} from "../../../src/markdown/properties";

function edit(source: string, operation: PropertyEdit): string {
  const changes = propertyChanges(source, operation);
  assert.ok(changes, `Rejected ${operation.type}`);
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    source =
      source.slice(0, change.from) + change.insert + source.slice(change.to);
  }
  return source;
}

test("empty headers and new properties preserve the note body and line endings", () => {
  assert.deepEqual(frontmatter("---\n---\nbody")?.values, {});
  for (const eol of ["\n", "\r\n"]) {
    const source = `First${eol}Second${eol}`;
    const added = edit(source, { type: "add", key: "first property" });
    assert.ok(added.endsWith(source));
    assert.equal(frontmatter(added)?.values?.["first property"], null);
    const filled = edit(added, {
      type: "set",
      key: "first property",
      value: "literal: value",
    });
    assert.equal(
      frontmatter(filled)?.values?.["first property"],
      "literal: value",
    );
    assert.ok(filled.endsWith(source));
  }
});

test("rename and removal preserve unrelated comments, multiline values and formatting", () => {
  const source =
    "---\n# keep heading\nold: 'literal' # keep inline\nblock: |\n  line one\n  line two\n# keep next\nlast: 2\n---\n\nBody\n";
  const renamed = edit(source, {
    type: "rename",
    key: "old",
    name: "new: key",
  });
  assert.equal(renamed.replace('"new: key"', "old"), source);
  assert.equal(
    propertyChanges(renamed, { type: "rename", key: "new: key", name: "last" }),
    undefined,
  );
  const removed = edit(renamed, { type: "remove", keys: ["block"] });
  assert.equal(
    removed,
    renamed.replace("block: |\n  line one\n  line two\n", ""),
  );
  assert.ok(removed.includes("# keep next\nlast: 2"));
});

test("property edits retain flow mappings and reject removal of a referenced anchor", () => {
  const flow = "---\n{title: Original, count: 2}\n---\nBody";
  const added = edit(flow, { type: "add", key: "other", value: ["a", 3] });
  const removed = edit(added, { type: "remove", keys: ["count"] });
  assert.deepEqual(frontmatter(removed)?.values, {
    title: "Original",
    other: ["a", 3],
  });
  const anchored = "---\ntitle: &name Original\ncopy: *name\n---\nBody";
  assert.equal(
    propertyChanges(anchored, { type: "remove", keys: ["title"] }),
    undefined,
  );
  assert.deepEqual(
    frontmatter(
      edit(anchored, { type: "rename", key: "title", name: "renamed" }),
    )?.values,
    { renamed: "Original", copy: "Original" },
  );
});

test("explicit value editing changes scalar types and retains unrelated inline comments", () => {
  const source = "---\ncount: '42' # keep\nempty:\ntags: []\n---\nBody";
  const number = edit(source, { type: "set", key: "count", value: 43 });
  assert.equal(number, source.replace("'42'", "43"));
  const text = edit(number, { type: "set", key: "count", value: "43" });
  assert.equal(frontmatter(text)?.values?.count, "43");
  const filled = edit(text, { type: "set", key: "empty", value: true });
  assert.equal(frontmatter(filled)?.values?.empty, true);
  assert.equal(
    propertyChanges(source, { type: "set", key: "count", value: Infinity }),
    undefined,
  );
});

test("adding properties distinguishes an unfinished header from ordinary Markdown", () => {
  const source = "---text\nBody";
  const added = edit(source, { type: "add", key: "topic", value: "notes" });
  assert.ok(added.endsWith(source));
  assert.equal(frontmatter(added)?.values?.topic, "notes");
  for (const unfinished of [
    "---",
    "---\ntitle: value",
    "---\r\ntitle: value",
  ]) {
    assert.equal(
      propertyChanges(unfinished, { type: "add", key: "topic" }),
      undefined,
    );
  }
});

test("new properties reject non-finite scalar and list values", () => {
  for (const source of [
    "Body",
    "---\ntitle: Original\n---\nBody",
    "---\n{title: Original}\n---\nBody",
  ]) {
    for (const value of [NaN, Infinity, -Infinity, ["valid", Infinity]]) {
      assert.equal(
        propertyChanges(source, { type: "add", key: "value", value }),
        undefined,
      );
    }
  }
});

test("structured property paste merges nested values and unions lists without touching other YAML", () => {
  for (const eol of ["\n", "\r\n"]) {
    const source = [
      "---",
      "title: 'Original' # title",
      "tags: [one, two] # tags",
      "details: {keep: yes, replace: 1}",
      "literal: |",
      "  Unchanged text.",
      "# trailing",
      "---",
      "",
      "Body",
    ].join(eol);
    const result = edit(source, {
      type: "merge",
      values: {
        title: "New",
        tags: ["two", "three"],
        details: { replace: 2, added: true },
        newKey: ["x"],
      },
    });
    assert.deepEqual(frontmatter(result)?.values, {
      title: "New",
      tags: ["one", "two", "three"],
      details: { keep: "yes", replace: 2, added: true },
      literal: "Unchanged text.\n",
      newKey: ["x"],
    });
    assert.ok(result.includes("title: 'New' # title"));
    assert.ok(result.includes("tags: [one, two, three] # tags"));
    assert.ok(
      result.includes(
        ["literal: |", "  Unchanged text.", "# trailing"].join(eol),
      ),
    );
    assert.ok(result.endsWith(["---", "", "Body"].join(eol)));
  }
});

test("structured property paste handles flow maps, empty values and null merge rules", () => {
  const flow = edit("---\n{title: original, count: 0, tags: [a]}\n---\nBody", {
    type: "merge",
    values: { title: null, count: null, tags: ["b"], newKey: "new" },
  });
  assert.deepEqual(frontmatter(flow)?.values, {
    title: "original",
    count: null,
    tags: ["a", "b"],
    newKey: "new",
  });
  assert.deepEqual(
    frontmatter(
      edit("---\nblank:\n---\nBody", {
        type: "merge",
        values: { blank: "filled" },
      }),
    )?.values,
    { blank: "filled" },
  );
  assert.deepEqual(
    frontmatter(
      edit("---\n---\nBody", {
        type: "merge",
        values: { list: [1, false, "中文"] },
      }),
    )?.values,
    { list: [1, false, "中文"] },
  );
});

test("an invalid property in a paste rejects the whole batch", () => {
  const source = "---\nfirst: original\n---\nBody";
  for (const invalid of [undefined, Infinity, () => 1]) {
    assert.equal(
      propertyChanges(source, {
        type: "merge",
        values: { first: "changed", invalid },
      }),
      undefined,
    );
  }
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.equal(
    propertyChanges(source, { type: "merge", values: cycle }),
    undefined,
  );
  assert.equal(
    propertyChanges(source, {
      type: "merge",
      values: { first: "changed", "bad\nkey": "value" },
    }),
    undefined,
  );
});

test("structured paste treats inherited-looking names as ordinary own properties", () => {
  const result = edit("---\nfirst: retained\n---\nBody", {
    type: "merge",
    values: JSON.parse('{"__proto__":{"marker":"own"},"constructor":"value"}'),
  });
  const value = frontmatter(result)?.values;
  assert.equal(Object.hasOwn(value!, "__proto__"), true);
  assert.deepEqual(value?.__proto__, { marker: "own" });
  assert.equal(value?.constructor, "value");
  assert.equal(({} as Record<string, unknown>).marker, undefined);
});

test("key edits reject missing and duplicate keys without partial removal", () => {
  const source = "---\na: 1\nb: 2\n---\nBody";
  for (const operation of [
    { type: "add", key: "a", value: 3 },
    { type: "rename", key: "missing", name: "c" },
    { type: "set", key: "missing", value: 3 },
    { type: "remove", keys: ["a", "missing"] },
  ] satisfies PropertyEdit[]) {
    assert.equal(propertyChanges(source, operation), undefined);
  }
  assert.equal(edit(source, { type: "rename", key: "a", name: "a" }), source);
  assert.equal(edit(source, { type: "remove", keys: [] }), source);
});

test("structured merge retains truthy values on null and replaces falsy values", () => {
  const source =
    "---\ntruth: value\nflag: false\ncount: 0\nempty: ''\n---\nBody";
  const result = edit(source, {
    type: "merge",
    values: {
      truth: null,
      flag: null,
      count: null,
      empty: null,
      added: ["one"],
    },
  });
  assert.deepEqual(frontmatter(result)?.values, {
    truth: "value",
    flag: null,
    count: null,
    empty: null,
    added: ["one"],
  });
  assert.ok(result.endsWith("---\nBody"));
});
