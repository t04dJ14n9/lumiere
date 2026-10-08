import test from "node:test";
import assert from "node:assert/strict";
import { frontmatter, propertyChanges } from "../../../src/markdown/properties";

function ordered(source: string, keys: string[]): string {
  const changes = propertyChanges(source, { type: "order", keys });
  assert.ok(changes);
  return changes.reduceRight(
    (source, change) => source.slice(0, change.from) + change.insert + source.slice(change.to),
    source,
  );
}

test("property order moves complete entries with comments and multiline values", () => {
  for (const eol of ["\n", "\r\n"]) {
    const z = ["# z comment", "z: 'quoted' # inline", ""].join(eol);
    const a = ["", "# a comment", "a: |+", "  first", "  second", "", ""].join(eol);
    const m = ["m: [one, two]", ""].join(eol);
    const source = `---${eol}${z}${a}${m}# footer${eol}---${eol}${eol}Body`;
    const result = ordered(source, ["a", "m", "z"]);
    assert.deepEqual(Object.keys(frontmatter(result)!.values!), ["a", "m", "z"]);
    assert.deepEqual(frontmatter(result)?.values, frontmatter(source)?.values);
    for (const fragment of [
      "# z comment",
      "'quoted' # inline",
      "# a comment",
      "a: |+",
      "  first",
      "  second",
      "m: [one, two]",
      "# footer",
    ]) {
      assert.equal(result.split(fragment).length, 2, fragment);
    }
    assert.ok(result.endsWith(`# footer${eol}---${eol}${eol}Body`));
    if (eol === "\r\n") {
      assert.equal(result.replaceAll("\r\n", "").includes("\n"), false);
    }
  }
});

test("flow property maps retain values, quotes and comments through a reorder", () => {
  const source = '---\n{z: "quoted", a: [one, {two: true}], m: null} # footer\n---\nBody';
  const result = ordered(source, ["a", "m", "z"]);
  assert.deepEqual(Object.keys(frontmatter(result)!.values!), ["a", "m", "z"]);
  assert.deepEqual(frontmatter(result)?.values, frontmatter(source)?.values);
  assert.ok(result.includes('"quoted"'));
  assert.ok(result.includes("# footer"));
});

test("invalid key permutations cannot remove or duplicate a property", () => {
  const source = "---\na: 1\nb: 2\nc: 3\n---\nBody";
  for (const keys of [["b", "a"], ["b", "a", "a"], ["b", "a", "unknown"], []]) {
    assert.equal(propertyChanges(source, { type: "order", keys }), undefined);
  }
  assert.equal(ordered(source, ["a", "b", "c"]), source);
});

test("alias dependencies remain valid and forward-alias reorders are rejected", () => {
  const source = "---\nz: &root [one, two]\na: *root\nother: 3\n---\nBody";
  const result = ordered(source, ["other", "z", "a"]);
  assert.deepEqual(frontmatter(result)?.values, frontmatter(source)?.values);
  assert.equal(propertyChanges(source, { type: "order", keys: ["a", "z", "other"] }), undefined);
});

test("empty values, empty headers and punctuation in keys keep their source meaning", () => {
  const source = '---\n"z: key":\na: false\n---\nBody';
  assert.deepEqual(frontmatter(ordered(source, ["a", "z: key"]))?.values, {
    a: false,
    "z: key": null,
  });
  const empty = "---\n# empty\n---\nBody";
  assert.equal(ordered(empty, []), empty);
});
