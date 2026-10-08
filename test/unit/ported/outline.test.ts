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
test("fold ranges respect quote boundaries and repeated headings get distinct identities", () => {
  const source = "# Parent\n\n> ## Child\n> body\n\nOutside quote\n\n## Child\nbody\n";
  const [parent, quote, child] = headings(source);
  assert.equal(parent!.end, source.length);
  assert.ok(quote!.end < source.indexOf("Outside quote"));
  assert.notEqual(quote!.key, child!.key);
});
