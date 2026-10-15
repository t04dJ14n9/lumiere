import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, visit } from "yaml";
import { aliasPreservationChanges } from "../../../src/markdown/properties/alias-edits";
import { headerParts } from "../../../src/markdown/properties/frontmatter";

test("alias preservation resolves each external alias once across many anchor targets", (t) => {
  const count = 12;
  const entries = Array.from(
    { length: count },
    (_, index) => `  - &n${index} {value: ${index}}`,
  );
  const mirrors = Array.from(
    { length: count },
    (_, index) => `mirror${index}: *n${index}`,
  );
  const source = `---\nlist:\n${entries.join("\n")}\n${mirrors.join("\n")}\n---\n`;
  const header = headerParts(source)!;
  const document = parseDocument(header.body);
  const resolutions: Array<() => number> = [];
  visit(document, {
    Alias(_key, alias) {
      const resolve = t.mock.method(alias, "resolve");
      resolutions.push(() => resolve.mock.callCount());
    },
  });
  const changes = aliasPreservationChanges(
    source,
    header,
    document,
    document.get("list", true),
  );
  assert.equal(changes.length, count);
  assert.equal(resolutions.length, count);
  assert.deepEqual(
    resolutions.map((calls) => calls()),
    Array.from({ length: count }, () => 1),
  );
});
