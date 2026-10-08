import test from "node:test";
import assert from "node:assert/strict";
import { renderProperties } from "./sheet-html";

test("property sheet distinguishes editable scalars, list chips and escaped nested values", () => {
  const html = renderProperties(
    '---\ncount: 3\nflag: true\ntags: ["#one/two", "bad tag"]\nlist: [false, null, "<script>"]\nobject: {child: "<b>"}\n---\n',
  );
  assert.match(html, /type="number" data-property-input="count"/);
  assert.match(html, /type="checkbox" data-property="flag" checked/);
  assert.match(html, /data-tag="one\/two"/);
  assert.match(html, /<span>bad tag<\/span>/);
  assert.match(html, /data-property-list="list"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /class="property-object"/);
  assert.match(html, /&lt;b&gt;/);
  assert.doesNotMatch(html, /<script>|<b>/);
});

test("forced property types preserve warnings and editable control selection", () => {
  const source = "---\ncount: abc\nflag: text\nempty:\n---\n";
  const normal = renderProperties(source, {
    count: "number",
    flag: "checkbox",
    empty: "list",
  });
  assert.match(
    normal,
    /data-property-convert aria-label="Update count to Number"/,
  );
  assert.match(normal, /type="text" data-property-input="count"/);
  const forced = renderProperties(
    source,
    { count: "number", flag: "checkbox", empty: "list" },
    { count: "number", flag: "checkbox" },
  );
  assert.match(forced, /type="number" data-property-input="count"/);
  assert.match(forced, /type="checkbox" data-property="flag" checked/);
  assert.match(forced, /property-type-warning/);
  assert.match(forced, /data-property-list="empty"/);
  assert.doesNotMatch(forced, /data-property-convert aria-label="Update count/);
});

test("property rendering bounds recursive aliases and leaves absent frontmatter alone", () => {
  assert.equal(renderProperties("# note"), "");
  const recursive = renderProperties(
    "---\nloop: &loop { child: *loop }\n---\n",
  );
  assert.match(recursive, /Recursive YAML alias/);
  const empty = renderProperties("---\nvalue: null\n---\n");
  assert.match(empty, /property-empty">Empty/);
});
