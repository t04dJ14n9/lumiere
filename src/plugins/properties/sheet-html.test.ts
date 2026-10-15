import test from "node:test";
import assert from "node:assert/strict";
import { renderProperties } from "./sheet-html";

test("property sheet distinguishes editable scalars, list chips and editable nested YAML", () => {
  const html = renderProperties(
    '---\ncount: 3\nflag: true\ntags: ["#one/two", "bad tag"]\nlist: [false, null, "<script>"]\nobject: {child: "<b>"}\n---\n',
  );
  assert.match(html, /type="number" data-property-input="count"/);
  assert.match(html, /type="checkbox" data-property="flag"[^>]* checked/);
  assert.match(html, /data-tag="one\/two"/);
  assert.match(html, /<span>bad tag<\/span>/);
  assert.match(html, /data-property-list="list"/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-property-kind="yaml"/);
  assert.match(html, /data-property-input="object"/);
  assert.match(html, /&lt;b&gt;/);
  assert.doesNotMatch(html, /<script>|<b>/);
});

test("generated and sources complex values render as editable YAML drafts", () => {
  const html = renderProperties(
    '---\ngenerated:\n  by: agent\n  at: "2026-10-15T00:00:00Z"\nsources:\n  - resource: ../raw/a.pdf\n    id: a1\n---\n',
  );
  assert.match(
    html,
    /data-property-input="generated"[^>]*data-property-kind="yaml"/,
  );
  assert.match(
    html,
    /data-property-input="sources"[^>]*data-property-kind="yaml"/,
  );
  assert.match(html, /by: &quot;agent&quot;/);
  assert.match(html, /resource: &quot;\.\.\/raw\/a\.pdf&quot;/);
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

test("empty sources keeps custom renderer and YAML draft instead of scalar chips", () => {
  const html = renderProperties(
    "---\nsources: []\n---\n",
    {},
    {
      renderValue: (key) =>
        key === "sources"
          ? '<div class="source-rows" data-sources></div>'
          : undefined,
    },
  );
  assert.match(html, /data-sources/);
  assert.match(
    html,
    /data-property-input="sources"[^>]*data-property-kind="yaml"/,
  );
  assert.doesNotMatch(html, /data-property-list="sources"/);
});
