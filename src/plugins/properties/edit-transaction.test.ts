import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { frontmatter, propertyYamlInput } from "../../markdown/properties";
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

test("raw YAML drafts reject concurrent same-property and unrelated-header changes", () => {
  const original =
    "---\ngenerated:\n  by: old\n  # keep\n  checksum: abc\nkeep: yes\n---\nBody";
  const expected = frontmatter(original)!.raw;
  const yaml = "by: new\n# keep\nchecksum: abc\n";
  const operation = {
    type: "set" as const,
    key: "generated",
    value: propertyYamlInput(yaml)!,
    yaml,
  };
  for (const source of [
    original.replace("by: old", "by: external"),
    original.replace("# keep", "# edited concurrently"),
    original.replace("keep: yes", "keep: external"),
  ]) {
    assert.equal(
      propertyTransaction({
        document: Text.of(source.split("\n")),
        expected,
        operation,
        displayed: [],
      }),
      undefined,
    );
  }
  const bodyOnlyChange = original.replace("Body", "Body changed");
  const document = Text.of(bodyOnlyChange.split("\n"));
  const accepted = propertyTransaction({
    document,
    expected,
    operation,
    displayed: ["keep", "generated"],
  });
  assert.ok(accepted);
  const result = accepted.apply(document).toString();
  assert.match(result, /by: new\n {2}# keep\n {2}checksum: abc/);
  assert.ok(result.endsWith("Body changed"));
  assert.deepEqual(Object.keys(frontmatter(result)!.values!), [
    "keep",
    "generated",
  ]);
});
