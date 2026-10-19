import test from "node:test";
import assert from "node:assert/strict";
import { headings } from "../../../src/markdown/metadata/headings";

test("outline recognizes real headings and excludes properties, code and math", () => {
  const source =
    "---\ntitle: Hidden\n---\n# **First** [link](url)\n\n```md\n# Not a heading\n```\n\n$$\n# Not math heading\n$$\n\nSecond\n------\n\n## [[Note|Alias]]\n";
  assert.deepEqual(
    headings(source).map((h) => h.label),
    ["First link", "Second", "Alias"],
  );
});
test("a heading inside a quote or list item is not a heading, and repeated headings get distinct identities", () => {
  const source =
    "# Parent\n\n> ## Quoted\n> body\n\n- ## Listed\n\n## Child\nbody\n\n## Child\nbody\n";
  const [parent, child, again, ...rest] = headings(source);
  assert.deepEqual(
    [parent!.label, child!.label, again!.label, rest.length],
    ["Parent", "Child", "Child", 0],
  );
  assert.equal(parent!.end, source.length);
  assert.notEqual(child!.key, again!.key);
});
