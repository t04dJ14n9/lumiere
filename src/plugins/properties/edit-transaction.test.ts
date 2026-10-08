import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { frontmatter } from "../../markdown/properties";
import { propertyTransaction } from "./edit-transaction";

const source = "---\na: 1\nb: two\nc: true\n---\nBody";
const document = Text.of(source.split("\n"));
const expected = frontmatter(source)!.raw;

test("property transactions combine a rename or removal with current displayed order", () => {
  const renamed = propertyTransaction({
    document,
    expected,
    displayed: ["c", "a", "b"],
    operation: { type: "rename", key: "a", name: "renamed" },
  })!;
  const renamedSource = renamed.apply(document).toString();
  assert.deepEqual(Object.keys(frontmatter(renamedSource)!.values!), [
    "c",
    "renamed",
    "b",
  ]);
  assert.equal(frontmatter(renamedSource)!.values!.renamed, 1);
  assert.ok(renamedSource.endsWith("\nBody"));
  const removed = propertyTransaction({
    document,
    expected,
    displayed: ["c", "a", "b"],
    operation: { type: "remove", keys: ["a"] },
  })!;
  assert.deepEqual(
    Object.keys(frontmatter(removed.apply(document).toString())!.values!),
    ["c", "b"],
  );
});

test("property transactions reject stale input and preserve empty or explicit-order changes", () => {
  const operation = { type: "set", key: "a", value: 1 } as const;
  assert.equal(
    propertyTransaction({
      document,
      expected: "stale",
      displayed: [],
      operation,
    }),
    undefined,
  );
  assert.equal(
    propertyTransaction({
      document,
      expected,
      displayed: ["a", "b", "c"],
      operation,
    })!.empty,
    true,
  );
  const changed = propertyTransaction({
    document,
    expected,
    displayed: ["c", "b", "a"],
    operation: { type: "order", keys: ["b", "a", "c"] },
  })!;
  assert.deepEqual(
    Object.keys(frontmatter(changed.apply(document).toString())!.values!),
    ["b", "a", "c"],
  );
  const mismatchedDisplay = propertyTransaction({
    document,
    expected,
    displayed: ["c"],
    operation: { type: "set", key: "a", value: 2 },
  })!;
  assert.deepEqual(
    Object.keys(
      frontmatter(mismatchedDisplay.apply(document).toString())!.values!,
    ),
    ["a", "b", "c"],
  );
});
