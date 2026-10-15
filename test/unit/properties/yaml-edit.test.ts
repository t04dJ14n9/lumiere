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

function yamlDraft(source: string, key: string): string {
  const textarea = renderProperties(source).match(
    new RegExp(`data-property-input="${key}"[^>]*>([\\s\\S]*?)</textarea>`),
  );
  assert.ok(textarea, `Missing YAML editor for ${key}`);
  return decodeEntities(textarea[1]!);
}

function editYaml(source: string, key: string, yaml: string): string {
  const value = propertyYamlInput(yaml);
  assert.notEqual(value, undefined, "Invalid test draft");
  return edit(source, { type: "set", key, value: value!, yaml });
}

for (const eol of ["\n", "\r\n"]) {
  test(`nested YAML edits retain source comments, quotes and typed comments (${JSON.stringify(eol)})`, () => {
    const body =
      "generated:\n  by: old\n  # checksum is generated externally; keep this\n  checksum: abc\n  serial: 9007199254740993\n  id: !!str '01' # keep quoting and tag\n  notes: |+\n    a\n\n";
    const source =
      `---\n# Header\n${body}title: 'Note'\n---\nBody\n`.replaceAll("\n", eol);
    const draft = yamlDraft(source, "generated");
    assert.equal(
      draft,
      body.slice("generated:\n  ".length).replaceAll("\n  ", "\n"),
    );
    const yaml = draft
      .replace("by: old", "by: new")
      .replace("checksum: abc", "# typed in the draft\nchecksum: abc");
    const next = editYaml(source, "generated", yaml);
    assert.equal(
      next,
      source
        .replace("by: old", "by: new")
        .replace("checksum: abc", `# typed in the draft${eol}  checksum: abc`),
    );
    assert.equal(
      (frontmatter(next)?.values?.generated as { notes: string }).notes,
      "a\n\n",
    );
  });
}

test("Sources YAML drafts retain comments inside lists of mappings", () => {
  const source =
    "---\nsources:\n  - resource: ../raw/old.pdf\n    # stable id\n    id: '01'\nkeep: yes\n---\n";
  const yaml = yamlDraft(source, "sources").replace("old.pdf", "new.pdf");
  assert.equal(
    editYaml(source, "sources", yaml),
    source.replace("old.pdf", "new.pdf"),
  );
});

test("anchored YAML drafts preserve leading comments and prior external alias values", () => {
  const source =
    "---\ngenerated: &a # generated comment\n  # before the first child\n  by: old\n  # checksum is external\n  checksum: 'abc'\nmirror: *a\n---\n";
  const yaml = yamlDraft(source, "generated").replace("by: old", "by: new");
  const next = editYaml(source, "generated", yaml);
  assert.match(next, /# generated comment/);
  assert.match(next, /# before the first child/);
  assert.match(next, /# checksum is external/);
  assert.match(next, /checksum: 'abc'/);
  assert.deepEqual(frontmatter(next)?.values, {
    generated: { by: "new", checksum: "abc" },
    mirror: { by: "old", checksum: "abc" },
  });
});

test("aliases to tagged pairs cannot bypass the draft and set guards", () => {
  const source = "---\nfirst: &a !!pairs [a: 1]\nvalue: *a\nkeep: yes\n---\n";
  assert.doesNotMatch(renderProperties(source), /data-property-input="value"/);
  assert.equal(
    propertyYamlInput("first: &a !!pairs [a: 1]\nsecond: *a"),
    undefined,
  );
  assert.equal(
    propertyChanges(source, {
      type: "set",
      key: "value",
      value: ["a"],
      yaml: "[a]",
    }),
    undefined,
  );
});

test("flow YAML drafts retain inline comments and property-adjacent bytes", () => {
  const source =
    "---\ngenerated: {by: old, # keep the child comment\n  checksum: 'abc'} # property comment\ntitle: Note\n---\n";
  const yaml = yamlDraft(source, "generated")
    .replace("by: old", "by: new")
    .replace("checksum:", "# typed inside flow YAML\n  checksum:");
  assert.equal(
    editYaml(source, "generated", yaml),
    source
      .replace("by: old", "by: new")
      .replace("checksum:", "# typed inside flow YAML\n  checksum:"),
  );
});

test("raw YAML commits place block collections below inline property keys", () => {
  for (const source of [
    "---\ngenerated: {by: old}\nkeep: yes\n---\n",
    "---\ngenerated:\n    by: old\nkeep: yes\n---\n",
  ]) {
    const yaml = "by: new\n# typed\nchecksum: abc\n";
    const next = editYaml(source, "generated", yaml);
    assert.deepEqual(frontmatter(next)?.values, {
      generated: { by: "new", checksum: "abc" },
      keep: "yes",
    });
    assert.match(next, /# typed/);
  }
});

test("raw YAML commits reject invalid or mismatched drafts atomically", () => {
  const source = "---\ngenerated: {by: old}\nkeep: yes\n---\n";
  for (const yaml of ["by: [", "by: different"]) {
    assert.equal(
      propertyChanges(source, {
        type: "set",
        key: "generated",
        value: { by: "new" },
        yaml,
      }),
      undefined,
    );
  }
});

for (const yaml of [
  "!!pairs [a: 1, b: 2]",
  "!!pairs []",
  "{nested: !!pairs [a: 1]}",
  "!!map {a: 1}",
  "!!set {a: null}",
  "{at: !!timestamp 2026-10-15}",
]) {
  test(`tagged values stay display-only and cannot be stripped by set: ${yaml}`, () => {
    const source = `---\nvalue: ${yaml}\nkeep: yes\n---\n`;
    const html = renderProperties(source);
    assert.doesNotMatch(html, /data-property-input="value"/);
    assert.doesNotMatch(html, /data-property-list="value"/);
    assert.equal(propertyYamlInput(yaml), undefined);
    for (const raw of [undefined, "[a, b]"]) {
      assert.equal(
        propertyChanges(source, {
          type: "set",
          key: "value",
          value: ["a", "b"],
          yaml: raw,
        }),
        undefined,
      );
    }
    assert.equal(
      edit(source, { type: "set", key: "keep", value: "fresh" }),
      source.replace("keep: yes", "keep: fresh"),
    );
  });
}

test("replacing an anchor materializes an exact integer from source digits", () => {
  const source = "---\nfirst: &a 9007199254740993\nmirror: *a # keep\n---\n";
  const next = edit(source, { type: "set", key: "first", value: 1 });
  assert.equal(next, "---\nfirst: 1\nmirror: 9007199254740993 # keep\n---\n");
  assert.doesNotMatch(next, /9007199254740992/);
});

test("alias materialization keeps exact integers inside collections and nested aliases", () => {
  const source =
    "---\nother: &n 9007199254740993\nfirst: &a {positive: 9007199254740993, negative: -9007199254740993, nested: [*n, .nan, .inf, -.inf]}\nmirror: *a\n---\n";
  const next = edit(source, { type: "set", key: "first", value: 1 });
  assert.match(
    next,
    /mirror: \{positive: 9007199254740993, negative: -9007199254740993, nested: \[9007199254740993, \.nan, \.inf, -\.inf\]\}/,
  );
  assert.doesNotMatch(next, /9007199254740992/);
});

test("exact integer alias materialization also retains negative zero", () => {
  for (const yaml of ["-0", "{zero: -0}"]) {
    const source = `---\nfirst: &a ${yaml}\nmirror: *a\n---\n`;
    const next = edit(source, { type: "set", key: "first", value: 1 });
    assert.equal(next, `---\nfirst: 1\nmirror: ${yaml}\n---\n`);
    const mirror = frontmatter(next)?.values?.mirror;
    const zero =
      typeof mirror === "number" ? mirror : (mirror as { zero: number }).zero;
    assert.ok(Object.is(zero, -0));
  }
});

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

test("YAML drafts reject tagged timestamps instead of coercing to strings", () => {
  assert.equal(propertyYamlInput("at: !!timestamp 2026-10-15"), undefined);
  assert.equal(propertyYamlInput("{at: !!timestamp 2026-10-15}"), undefined);
});

test("nested alias sites keep multiline collection inserts indented", () => {
  const long = "x".repeat(40) + "\n\nnext";
  const source = "---\nfirst: &a\n  note: short\nmirror:\n  nested: *a\n---\n";
  const next = edit(source, {
    type: "set",
    key: "first",
    value: { note: long },
  });
  assert.deepEqual(frontmatter(next)?.values?.first, { note: long });
  assert.deepEqual(frontmatter(next)?.values?.mirror, {
    nested: { note: "short" },
  });
});

test("hash characters inside quoted keys do not hide genuine anchors", () => {
  const source = '---\nfirst: &a old\n"second#tag": &a second\n---\n';
  const next = edit(source, {
    type: "set",
    key: "second#tag",
    value: "fresh",
  });
  assert.deepEqual(frontmatter(next)?.values, {
    first: "old",
    "second#tag": "fresh",
  });
});

test("YAML drafts reject colliding YAML mapping keys that collapse in JS", () => {
  assert.equal(propertyYamlInput('1: first\n"1": second'), undefined);
  assert.deepEqual(propertyYamlInput("a: 1\nb: 2"), { a: 1, b: 2 });
});

for (const [scalar, value] of [
  [".nan", NaN],
  [".inf", Infinity],
  ["-.inf", -Infinity],
] as const) {
  test(`structured paste preserves an external alias to ${scalar}`, () => {
    const source = `---\n# Keep the header comment\nlist: [&n ${scalar}]\nmirror: *n # Keep the alias comment\nuntouched: '01'\n---\nBody\n`;
    const next = edit(source, { type: "merge", values: { list: [1] } });
    assert.deepEqual(frontmatter(next)?.values, {
      list: [value, 1],
      mirror: value,
      untouched: "01",
    });
    assert.equal(
      next,
      `---\n# Keep the header comment\nlist: [${scalar}, 1]\nmirror: ${scalar} # Keep the alias comment\nuntouched: '01'\n---\nBody\n`,
    );
  });
}

test("structured paste preserves YAML-only numbers and multiline strings inside aliased collections", () => {
  const note = "first".repeat(10) + "\nsecond";
  const prior = { nan: NaN, limits: [Infinity, -Infinity], note };
  const source = `---\nlist: [&n {nan: .nan, limits: [.inf, -.inf], note: ${JSON.stringify(note)}}]\nmirror:\n  nested: [*n] # Keep the nested comment\n---\nBody\n`;
  const next = edit(source, { type: "merge", values: { list: [1] } });
  assert.deepEqual(frontmatter(next)?.values, {
    list: [prior, 1],
    mirror: { nested: [prior] },
  });
  assert.ok(next.endsWith(" # Keep the nested comment\n---\nBody\n"));
});
