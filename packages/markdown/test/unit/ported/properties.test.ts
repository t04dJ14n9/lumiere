import test from "node:test";
import assert from "node:assert/strict";
import {
  booleanPropertyChange,
  frontmatter,
  scalarPropertyChange,
  listPropertyChange,
} from "../../../src/markdown/properties";
import { renderProperties } from "../../../src/plugins/properties/sheet-html";

test("recursive YAML properties render without throwing or mistaking shared aliases for cycles", () => {
  for (const yaml of ["items: &items [*items]", "item: &item {self: *item}"]) {
    const html = renderProperties(`---\n${yaml}\n---\n`);
    assert.match(html, /Source mode/);
    assert.doesNotMatch(html, /class="property-chip"|class="property-object"/);
  }
  // Shared aliases of collections: Obsidian-unknown JSON (#141), not YAML drafts.
  const repeated = renderProperties(
    "---\nfirst: &shared [one, two]\nsecond: *shared\n---\n",
  );
  assert.doesNotMatch(repeated, /Source mode/);
  assert.equal((repeated.match(/mod-unknown/g) ?? []).length, 2);
  assert.match(repeated, /one/);
  assert.match(repeated, /two/);
  assert.doesNotMatch(repeated, /data-property-kind="yaml"/);
});

test("nested property values preserve links, empty lists and multiline text", () => {
  const html = renderProperties(
    '---\nobject: {link: "[[Linked]]", missing: null, list: []}\ntext: |\n  first\n  second\n---\n',
  );
  // Nested maps are Obsidian Unknown JSON (#141).
  assert.match(html, /data-property-key="object"[\s\S]*mod-unknown/);
  assert.match(html, /\[\[Linked\]\]/);
  assert.match(html, /list/);
  // Block scalar text stays a longtext/yaml-style editor when typed as text.
  assert.match(html, /data-property-input="text"/);
  assert.match(html, /first/);
  assert.match(html, /second/);
});

test("boolean property edits preserve anchors, comments, flow syntax and CRLF", () => {
  for (const source of [
    '---\nflag: &value true # keep\nother: "quoted"\n---\nBody\n',
    '---\r\n{flag: true, other: "quoted"}\r\n---\r\nBody\r\n',
  ]) {
    const change = booleanPropertyChange(source, "flag", false)!;
    assert.equal(
      source.slice(0, change.from) + change.insert + source.slice(change.to),
      source.replace("true", "false"),
    );
  }
});
test("property strings cannot introduce extra interactive property controls", () => {
  const html = renderProperties(
    '---\nflag: true\nurl: "https://example.com <input data-property=flag>"\n---',
  );
  assert.equal((html.match(/<input type="checkbox"/g) ?? []).length, 1);
  assert.match(html, /&lt;input data-property=flag&gt;/);
});
test("text property edits preserve quote style and string types", () => {
  for (const [before, after, value] of [
    ["'Keep this'", "'O''Brien'", "O'Brien"],
    ["plain", '"true"', "true"],
  ]) {
    const source = `---\nname: ${before} # keep\n---\nBody\n`;
    const change = scalarPropertyChange(source, "name", value!)!;
    const result =
      source.slice(0, change.from) + change.insert + source.slice(change.to);
    assert.equal(result, source.replace(before!, after!));
    assert.equal(frontmatter(result)!.values!.name, value);
  }
});
test("numeric property edits preserve neighboring text and reject non-finite values", () => {
  const source = "---\ncount: 2 # keep\n---\nBody";
  const change = scalarPropertyChange(source, "count", 3.5)!;
  assert.equal(
    source.slice(0, change.from) + change.insert + source.slice(change.to),
    source.replace("2", "3.5"),
  );
  assert.equal(scalarPropertyChange(source, "count", Infinity), undefined);
  assert.equal(scalarPropertyChange(source, "count", "3.5"), undefined);
  assert.equal(
    scalarPropertyChange("---\ncount: !!int 2\n---", "count", 3.5),
    undefined,
  );
});
test("boolean property edits reject aliases, strings and duplicate keys", () => {
  for (const source of [
    "---\na: &x true\nflag: *x\n---",
    '---\nflag: "true"\n---',
    "---\nflag: true\nflag: false\n---",
  ]) {
    assert.equal(booleanPropertyChange(source, "flag", false), undefined);
  }
});

test("list edits preserve neighboring YAML, string types and line endings", () => {
  for (const source of [
    '---\ntags: [one, two]\nname: "Keep this" # comment\n---\nBody',
    '---\r\ntags:\r\n  - one\r\n  - two\r\nname: "Keep this" # comment\r\n---\r\nBody',
  ]) {
    const change = listPropertyChange(source, "tags", ["one", "true", "3"])!;
    assert.ok(change);
    const result =
      source.slice(0, change.from) + change.insert + source.slice(change.to);
    assert.deepEqual(frontmatter(result)!.values!.tags, ["one", "true", "3"]);
    assert.ok(result.endsWith(source.slice(source.indexOf("name:"))));
  }
  for (const source of [
    "---\ntags: [&tag one, *tag]\n---",
    "---\ntags:\n  - one # keep\n---",
  ]) {
    assert.equal(listPropertyChange(source, "tags", ["two"]), undefined);
  }
});

test("scalar serialization preserves negative zero and quotes multiline replacements", () => {
  const numeric = "---\nvalue: 2 # keep\n---";
  const change = scalarPropertyChange(numeric, "value", -0);
  assert.equal(change?.insert, "-0");
  for (const quoted of ["'old'", '"old"', "old"]) {
    const source = `---\nvalue: ${quoted}\n---`;
    const edit = scalarPropertyChange(source, "value", "first\nsecond");
    assert.ok(edit);
    const result =
      source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
    assert.equal(frontmatter(result)?.values?.value, "first\nsecond");
  }
});
