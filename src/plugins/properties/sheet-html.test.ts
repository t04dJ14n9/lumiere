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
  assert.match(html, /by: agent/);
  assert.match(html, /resource: \.\.\/raw\/a\.pdf/);
});

test("decision confidence maps and lists of maps always have YAML editors", () => {
  const html = renderProperties(
    "---\ndecision_conf:\n  score: 0.82\n  rationale: Evidence supports this\n  factors: [evidence, risk]\ndecisions:\n  - score: 0.9\n    factors: [review]\n---\n",
  );
  for (const key of ["decision_conf", "decisions"]) {
    assert.match(
      html,
      new RegExp(
        `<textarea[^>]*data-property-input="${key}"[^>]*data-property-kind="yaml"`,
      ),
    );
  }
  assert.doesNotMatch(html, /class="property-chip"|class="property-object"/);
});

test("nested references outside a property's raw slice fall back to editable serialized YAML", () => {
  const html = renderProperties(
    "---\nfactors: &f [evidence, risk]\ndecision_conf:\n  score: 0.82\n  factors: *f\n---\n",
  );
  assert.match(
    html,
    /<textarea[^>]*data-property-input="decision_conf"[^>]*data-property-kind="yaml">score: 0.82\nfactors:\n {2}- evidence\n {2}- risk/,
  );
  assert.doesNotMatch(html, /class="property-chip"|class="property-object"/);
});

test("long property names retain their full identity, accessible label and tooltip", () => {
  const key = "decision_confidence_and_supporting_evidence";
  const html = renderProperties(`---\n${key}: high\n---\n`);
  for (const attribute of [
    "data-property-key",
    "data-property-name",
    "value",
    "title",
  ]) {
    assert.ok(html.includes(`${attribute}="${key}"`), attribute);
  }
  assert.ok(html.includes(`aria-label="Property name: ${key}"`));
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
  assert.match(recursive, /Source mode/);
  assert.doesNotMatch(
    recursive,
    /class="property-chip"|class="property-object"/,
  );
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

test("Sources custom rows stay above editable YAML when entries reference external anchors", () => {
  const html = renderProperties(
    "---\nreference: &r {resource: ../raw/a.pdf, id: a1}\nsources: [*r]\n---\n",
    {},
    {
      renderValue: (key) =>
        key === "sources"
          ? '<div class="source-rows"><button data-source-open>Open source</button></div>'
          : undefined,
    },
  );
  assert.match(
    html,
    /class="property-complex"><div class="source-rows">[\s\S]*data-source-open[\s\S]*<textarea[^>]*data-property-input="sources"[^>]*data-property-kind="yaml">- resource: \.\.\/raw\/a\.pdf/,
  );
  assert.doesNotMatch(html, /data-property-list="sources"/);
});

test("tagged YAML sets that cannot round-trip stay non-draft displays", () => {
  const html = renderProperties("---\nvalue: !!set {a: null, b: null}\n---\n");
  assert.doesNotMatch(
    html,
    /data-property-input="value"[^>]*data-property-kind="yaml"/,
  );
});

test("tagged timestamps that do not round-trip stay non-draft displays", () => {
  const html = renderProperties(
    "---\ngenerated: {at: !!timestamp 2026-10-15, by: old}\n---\n",
  );
  assert.doesNotMatch(
    html,
    /data-property-input="generated"[^>]*data-property-kind="yaml"/,
  );
});

for (const value of ["!!pairs [a: 1]", "!!map {a: 1}", ".inf", "[.inf]"]) {
  test(`unsupported ${value} explains Source mode without misleading chips`, () => {
    const html = renderProperties(`---\nvalue: ${value}\n---\n`);
    assert.match(html, /Source mode/);
    assert.doesNotMatch(
      html,
      /data-property-kind="yaml"|class="property-chip"|class="property-object"/,
    );
  });
}
