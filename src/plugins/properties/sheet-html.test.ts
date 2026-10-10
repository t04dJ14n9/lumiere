import test from "node:test";
import assert from "node:assert/strict";
import { renderProperties } from "./sheet-html";

test("property sheet distinguishes editable scalars, list chips and escaped nested values", () => {
  const html = renderProperties(
    '---\ncount: 3\nflag: true\ntags: ["#one/two", "bad tag"]\nlist: [false, null, "<script>"]\nobject: {child: "<b>"}\n---\n',
  );
  assert.match(html, /type="number" data-property-input="count"/);
  assert.match(html, /type="checkbox" data-property="flag"[^>]* checked/);
  assert.match(html, /data-tag="one\/two"/);
  assert.match(html, /<span>bad tag<\/span>/);
  assert.match(html, /data-property-list="list"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /class="property-object"/);
  assert.match(html, /&lt;b&gt;/);
  assert.doesNotMatch(html, /<script>|<b>/);
});

test("registry property types retain mismatch warnings and choose the expected control", () => {
  const source = "---\ncount: abc\nflag: text\nempty:\n---\n";
  const normal = renderProperties(source, {
    count: "number",
    flag: "checkbox",
    empty: "list",
  });
  assert.match(normal, /Type mismatch, expected Number/);
  assert.match(normal, /type="number" data-property-input="count"/);
  assert.match(normal, /type="checkbox" data-property="flag"/);
  assert.doesNotMatch(normal, /data-property="flag"[^>]* checked/);
  assert.match(normal, /Type mismatch, expected Checkbox/);
  assert.match(normal, /data-property-list="empty"/);
  assert.doesNotMatch(normal, /data-property-convert/);
});

test("property rendering bounds recursive aliases and leaves absent frontmatter alone", () => {
  assert.equal(renderProperties("# note"), "");
  const recursive = renderProperties(
    "---\nloop: &loop { child: *loop }\n---\n",
  );
  assert.match(recursive, /Recursive YAML alias/);
  const empty = renderProperties("---\nvalue: null\n---\n");
  assert.match(empty, /data-placeholder="Empty"/);
});
