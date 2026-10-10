import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatValue, numberProblem, plainText, settingEntries, settingKind, type SchemaProperty } from "../../src/shared/setting-schema";

const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  contributes: { configuration: { properties: Record<string, SchemaProperty> } };
};
const properties = manifest.contributes.configuration.properties;
const entries = settingEntries(properties);

test("every contributed setting is listed, once, in the manifest's order, with a group, a title and a description", () => {
  assert.deepEqual(entries.map(entry => entry.key), Object.keys(properties));
  for (const entry of entries) {
    assert.ok(entry.group && entry.title, entry.key);
    assert.ok(entry.description.length > 10, `${entry.key} has a description`);
    assert.ok(!/[`*]|\]\(/u.test(entry.description), `${entry.key}: markdown left in the description`);
  }
});

test("settings are edited by type: boolean, tri-state, enum, number, and the rest in the Settings editor", () => {
  const kind = (key: string) => entries.find(entry => entry.key === key)!.kind;
  assert.equal(kind("vscodeEmbedPdf.keyboardShortcuts"), "boolean");
  assert.equal(kind("vscodeEmbedPdf.view.smoothScrolling"), "tristate");
  assert.equal(kind("vscodeEmbedPdf.view.pageLayout"), "enum");
  assert.equal(kind("vscodeEmbedPdf.regionImageCache.maxSizeMB"), "number");
  assert.equal(kind("vscodeEmbedPdf.view.defaultZoom"), "complex");
  assert.equal(settingKind({ type: "string" }), "string");
  assert.equal(settingKind({ type: "array" }), "complex");
  assert.equal(settingKind({}), "complex");
});

test("enum choices keep their descriptions; keys group by their first part", () => {
  const layout = entries.find(entry => entry.key === "vscodeEmbedPdf.view.pageLayout")!;
  assert.deepEqual(layout.choices.map(choice => choice.value), ["single", "spread", "spreadCover"]);
  assert.match(layout.choices[1]!.description, /Pair pages/u);
  assert.equal(layout.group, "View");
  assert.equal(layout.title, "Page Layout");
  assert.equal(entries.find(entry => entry.key === "vscodeEmbedPdf.keyboardShortcuts")!.group, "General");
  assert.equal(entries.find(entry => entry.key === "vscodeEmbedPdf.agentBridge.enabled")!.title, "Enabled");
});

test("numbers are checked against the manifest's minimum and maximum", () => {
  const cache = entries.find(entry => entry.key === "vscodeEmbedPdf.regionImageCache.maxSizeMB")!;
  assert.equal(cache.minimum, 1);
  assert.match(numberProblem("0", cache)!, /at least 1/u);
  assert.match(numberProblem("abc", cache)!, /number/u);
  assert.match(numberProblem("", cache)!, /number/u);
  assert.equal(numberProblem("50", cache), undefined);
  assert.match(numberProblem("500", { minimum: 25, maximum: 400 })!, /at most 400/u);
});

test("values read as short labels", () => {
  assert.equal(formatValue(true, "boolean"), "on");
  assert.equal(formatValue(false, "tristate"), "off");
  assert.equal(formatValue(null, "tristate"), "follows the editor");
  assert.equal(formatValue("paged", "enum"), "paged");
  assert.equal(formatValue(64, "number"), "64");
  assert.equal(formatValue(undefined, "string"), "not set");
  assert.equal(formatValue(["a"], "complex"), '["a"]');
  assert.equal(plainText("Use `#editor.smoothScrolling#` — see [docs](https://x.y) **now**"), "Use editor.smoothScrolling — see docs now");
});
