import test from "node:test";
import assert from "node:assert/strict";
import {
  frontmatter,
  propertyChanges,
  propertyYamlInput,
} from "../../../src/markdown/properties";
import { renderProperties } from "../../../src/plugins/properties/sheet-html";

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

function decodeEntities(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
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

test("YAML drafts keep significant trailing newlines on nested block scalars", () => {
  const source =
    "---\ntitle: Note\ngenerated:\n  by: old\n  notes: |+\n    a\n\n---\nBody\n";
  const current = frontmatter(source)?.values?.generated as {
    by: string;
    notes: string;
  };
  assert.equal(current.notes, "a\n\n");
  const next = edit(source, {
    type: "set",
    key: "generated",
    value: { by: "new", notes: current.notes },
  });
  assert.deepEqual(frontmatter(next)?.values?.generated, {
    by: "new",
    notes: "a\n\n",
  });
});

test("YAML draft HTML round-trips nested trailing newlines and leading spaces", () => {
  const source =
    '---\ngenerated:\n  by: old\n  notes: |+\n    a\n\ntext: " one\\n two"\n---\n';
  const html = renderProperties(source);
  const generated = html.match(
    /data-property-input="generated"[^>]*>([\s\S]*?)<\/textarea>/,
  )?.[1];
  const text = html.match(
    /data-property-input="text"[^>]*>([\s\S]*?)<\/textarea>/,
  )?.[1];
  assert.ok(generated);
  assert.ok(text);
  assert.deepEqual(propertyYamlInput(decodeEntities(generated!)), {
    by: "old",
    notes: "a\n\n",
  });
  assert.equal(propertyYamlInput(decodeEntities(text!)), " one\n two");
});

test("setting a nested value does not retarget unrelated YAML aliases", () => {
  const source =
    "---\nfirst: &shared\n  child: one\nsecond: *shared\nextra: keep\n---\n";
  const next = edit(source, {
    type: "set",
    key: "first",
    value: { child: "two" },
  });
  const values = frontmatter(next)?.values;
  assert.deepEqual(values?.first, { child: "two" });
  assert.deepEqual(values?.second, { child: "one" });
  assert.equal(values?.extra, "keep");
});

test("setting a value does not invent anchors that collide with existing aliases", () => {
  const source = "---\nother: &a1\n  x: 1\ntarget: old\n---\n";
  const shared = { z: 1 };
  const next = edit(source, {
    type: "set",
    key: "target",
    value: { a: shared, b: shared },
  });
  const values = frontmatter(next)?.values;
  assert.deepEqual(values?.other, { x: 1 });
  assert.deepEqual(values?.target, { a: { z: 1 }, b: { z: 1 } });
  assert.doesNotMatch(next, /target:[^\n]*&/);
});

test("invalid YAML drafts are rejected without changing the document", () => {
  const source = "---\ngenerated:\n  by: old\ntitle: Note\n---\nBody\n";
  assert.equal(propertyYamlInput("{"), undefined);
  assert.equal(propertyYamlInput("by: ["), undefined);
  assert.equal(
    propertyChanges(source, {
      type: "set",
      key: "generated",
      value: undefined as never,
    }),
    undefined,
  );
  assert.equal(frontmatter(source)?.values?.title, "Note");
});

test("nested set preserves quoted string ids and unrelated keys", () => {
  const source =
    '---\ntitle: Note\nsources:\n  - resource: ../raw/a.pdf\n    id: "01"\n---\n';
  const next = edit(source, {
    type: "set",
    key: "sources",
    value: [{ resource: "../raw/b.pdf", id: "01" }],
  });
  assert.match(next, /id: "01"/);
  assert.equal(frontmatter(next)?.values?.title, "Note");
  assert.deepEqual(frontmatter(next)?.values?.sources, [
    { resource: "../raw/b.pdf", id: "01" },
  ]);
});

test("nested aliases resolve when inlining a replaced anchored value", () => {
  const source =
    "---\nother: &o\n  - 1\n  - 2\nfirst: &s\n  child: *o\nsecond: *s\n---\n";
  const next = edit(source, {
    type: "set",
    key: "first",
    value: { child: [9] },
  });
  const values = frontmatter(next)?.values;
  assert.deepEqual(values?.first, { child: [9] });
  assert.deepEqual(values?.second, { child: [1, 2] });
  assert.deepEqual(values?.other, [1, 2]);
});

test("reused anchor names only rewrite aliases that resolve to the edited node", () => {
  const source = "---\na: &x 1\nb: *x\nc: &x 2\nd: *x\n---\n";
  const next = edit(source, { type: "set", key: "c", value: 9 });
  const values = frontmatter(next)?.values;
  assert.equal(values?.a, 1);
  assert.equal(values?.b, 1);
  assert.equal(values?.c, 9);
  assert.equal(values?.d, 2);
});

test("descendant anchors are preserved for external aliases", () => {
  const source = "---\nfirst:\n  child: &child old\nsecond: *child\n---\n";
  const next = edit(source, {
    type: "set",
    key: "first",
    value: { child: "new" },
  });
  const values = frontmatter(next)?.values;
  assert.deepEqual(values?.first, { child: "new" });
  assert.equal(values?.second, "old");
});

test("merge of an anchor and its alias does not overlap alias-preservation edits", () => {
  const source = "---\nfirst: &a\n  x: old\nsecond: *a\n---\n";
  const next = edit(source, {
    type: "merge",
    values: { first: { x: "new" }, second: { x: "new" } },
  });
  assert.deepEqual(frontmatter(next)?.values, {
    first: { x: "new" },
    second: { x: "new" },
  });
  assert.doesNotMatch(next, /\{x: old\}\{x: new\}/);
});

test("unrelated recursive aliases do not block editing other properties", () => {
  const source = "---\nloop: &loop\n  - *loop\ntitle: old\n---\n";
  const next = edit(source, { type: "set", key: "title", value: "new" });
  assert.equal(frontmatter(next)?.values?.title, "new");
  assert.ok(frontmatter(next)?.values?.loop);
});

test("merge preserves explicit alias values regardless of paste key order", () => {
  const source = "---\nfirst: &a 1\nsecond: *a\n---\n";
  for (const values of [
    { first: 2, second: 3 },
    { second: 3, first: 2 },
  ]) {
    const next = edit(source, { type: "merge", values });
    assert.deepEqual(frontmatter(next)?.values, { first: 2, second: 3 });
  }
});

test("inlining multiline anchored strings quotes them at alias sites", () => {
  const source = '---\nfirst: &a "one\\ntwo"\nsecond: *a\n---\n';
  const next = edit(source, { type: "set", key: "first", value: "x" });
  assert.deepEqual(frontmatter(next)?.values, {
    first: "x",
    second: "one\ntwo",
  });
});

test("replacing a map with a multiline string quotes the insert", () => {
  const source = "---\nobj: {a: 1}\n---\n";
  const next = edit(source, {
    type: "set",
    key: "obj",
    value: "first\nsecond",
  });
  assert.deepEqual(frontmatter(next)?.values, { obj: "first\nsecond" });
  assert.match(next, /obj: "first\\nsecond"/);
});

test("inlining document-marker strings quotes them at alias sites", () => {
  for (const prior of ["---", "..."]) {
    const source = `---\nfirst: &a ${JSON.stringify(prior)}\nsecond: [*a]\n---\n`;
    const next = edit(source, { type: "set", key: "first", value: "x" });
    assert.deepEqual(frontmatter(next)?.values, {
      first: "x",
      second: [prior],
    });
  }
});

test("anchor mentions in comments do not retarget valueStart", () => {
  const source = "---\ngenerated: &a # reuse &a\n  by: old\nkeep: yes\n---\n";
  const next = edit(source, {
    type: "set",
    key: "generated",
    value: { by: "new" },
  });
  assert.deepEqual(frontmatter(next)?.values?.generated, { by: "new" });
  assert.equal(frontmatter(next)?.values?.keep, "yes");
});
