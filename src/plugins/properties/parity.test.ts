import test from "node:test";
import assert from "node:assert/strict";
import { renderProperties } from "./sheet-html";
import { rowKeyAction } from "./row-navigation";
import { inferPropertyKind } from "../../markdown/properties/types";
import { frontmatter, propertyChanges } from "../../markdown/properties";

test("measured sheet structure and inline value widgets replace display/Edit controls", () => {
  const html = renderProperties(
    '---\ntitle: Hello\nnum: 3\nflag: true\ndue: 2026-10-08\nmeeting: 2026-10-08T14:30\naliases: [Other]\ntags: [one]\nlist: [a]\nrelated: "[[Target]]"\n---\n',
  );
  for (const className of [
    "metadata-container",
    "metadata-properties-heading",
    "metadata-content",
    "metadata-properties",
    "metadata-property-key",
    "metadata-property-value",
    "metadata-input-longtext",
    "multi-select-container",
    "multi-select-input",
    "metadata-link",
  ]) {
    assert.ok(html.includes(className), className);
  }
  assert.match(html, /contenteditable="true"/);
  assert.match(html, /<span class="metadata-property-icon">/);
  assert.match(html, /metadata-property-warning-icon" hidden/);
  assert.match(html, /inputmode="decimal"/);
  assert.doesNotMatch(
    html,
    /<details class="properties"|property-count|>Edit<|<input hidden/,
  );
  for (const icon of [
    "text",
    "binary",
    "check-square",
    "calendar",
    "clock",
    "list",
    "tags",
    "forward",
  ]) {
    assert.ok(html.includes(`data-lucide="${icon}"`), icon);
  }
});

test("selected type always renders its widget and a non-mutating mismatch warning", () => {
  const html = renderProperties("---\nnum: abc\nflag: hello\n---\n", {
    num: "number",
    flag: "checkbox",
  });
  assert.match(html, /type="number"/);
  assert.match(html, /Type mismatch, expected Number/);
  assert.match(html, /Type mismatch, expected Checkbox/);
  assert.doesNotMatch(html, /data-property-convert/);
});

test("reserved aliases and cssclasses types cannot be overridden by preferences", () => {
  assert.equal(
    inferPropertyKind("aliases", "Other", { aliases: "number" }),
    "aliases",
  );
  assert.equal(
    inferPropertyKind("CSSClasses", "wide", { cssclasses: "checkbox" }),
    "list",
  );
});

test("row Delete removes, Escape returns to the document, and Backspace does not remove", () => {
  const key = (key: string, ctrlKey = false) => ({
    key,
    ctrlKey,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  });
  assert.equal(rowKeyAction(key("Delete"), false), "remove");
  assert.equal(rowKeyAction(key("Escape"), false), "body");
  assert.equal(rowKeyAction(key("Backspace"), false), undefined);
  assert.equal(rowKeyAction(key("Backspace", true), false), undefined);
});

test("committing a new property writes an empty YAML value", () => {
  const source = "---\ntitle: Hello\n---\nBody";
  const changes = propertyChanges(source, { type: "add", key: "status" })!;
  const result = changes.reduceRight(
    (text, change) =>
      text.slice(0, change.from) + change.insert + text.slice(change.to),
    source,
  );
  assert.match(result, /\nstatus:\s*\n---/);
  assert.equal(frontmatter(result)?.values?.status, null);
});
