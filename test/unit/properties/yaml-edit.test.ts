import test from "node:test";
import assert from "node:assert/strict";
import {
  frontmatter,
  propertyChanges,
  propertyYamlInput,
} from "../../../src/markdown/properties";

function edit(
  source: string,
  operation: Parameters<typeof propertyChanges>[1],
): string {
  const changes = propertyChanges(source, operation);
  assert.ok(changes, `Rejected ${operation.type}`);
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    source =
      source.slice(0, change.from) + change.insert + source.slice(change.to);
  }
  return source;
}

test("propertyYamlInput accepts nested maps and list-of-maps", () => {
  assert.deepEqual(propertyYamlInput("by: agent\nat: now"), {
    by: "agent",
    at: "now",
  });
  assert.deepEqual(propertyYamlInput("- resource: ../raw/a.pdf\n  id: a1"), [
    { resource: "../raw/a.pdf", id: "a1" },
  ]);
  assert.equal(propertyYamlInput(""), null);
  assert.equal(propertyYamlInput("{"), undefined);
});

test("Properties can set generated maps and sources list-of-maps", () => {
  const source =
    "---\ntitle: Note\ngenerated:\n  by: old\n  at: old\nsources:\n  - resource: ../raw/old.pdf\n---\nBody\n";
  const withGenerated = edit(source, {
    type: "set",
    key: "generated",
    value: { by: "agent", at: "2026-10-15T00:00:00Z" },
  });
  assert.deepEqual(frontmatter(withGenerated)?.values?.generated, {
    by: "agent",
    at: "2026-10-15T00:00:00Z",
  });
  const withSources = edit(withGenerated, {
    type: "set",
    key: "sources",
    value: [{ resource: "../raw/new.pdf", id: "n1" }],
  });
  assert.deepEqual(frontmatter(withSources)?.values?.sources, [
    { resource: "../raw/new.pdf", id: "n1" },
  ]);
  assert.equal(frontmatter(withSources)?.values?.title, "Note");
});
