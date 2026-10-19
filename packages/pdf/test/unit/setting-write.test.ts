import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type SchemaProperty,
  writeProblem,
} from "../../src/shared/setting-schema";
import { pdfContributes } from "./support/manifest";

const manifest = {
  contributes: pdfContributes<{
    configuration:
      | { properties: Record<string, SchemaProperty> }
      | { properties: Record<string, SchemaProperty> }[];
  }>(),
};
const configuration = manifest.contributes.configuration;
const properties = Object.assign(
  {},
  ...(Array.isArray(configuration) ? configuration : [configuration]).map(
    (section) => section.properties,
  ),
) as Record<string, SchemaProperty>;
const problem = (key: unknown, value: unknown) =>
  writeProblem(properties, key, value);

test("a settings write passes only for a contributed key and a value that fits its schema", () => {
  assert.equal(problem("lumiere.pdf.keyboardShortcuts", false), undefined);
  assert.equal(problem("lumiere.pdf.view.smoothScrolling", null), undefined);
  assert.equal(problem("lumiere.pdf.view.defaultZoom", "fitPage"), undefined);
  assert.equal(problem("lumiere.pdf.view.defaultZoom", 250), undefined);
  assert.equal(
    problem("lumiere.pdf.view.pageLayout", "spreadCover"),
    undefined,
  );
  assert.equal(
    problem("lumiere.pdf.regionImageCache.maxSizeMB", 50),
    undefined,
  );
});

test("keys outside the extension, unknown keys and inherited names are refused", () => {
  for (const key of [
    "editor.fontSize",
    "markdownWorkbench.editor.fontSize",
    "lumiere.pdf.nope",
    "lumiere.pdf.",
    "lumiere.pdf.constructor",
    "lumiere.pdf.__proto__",
    "files.autoSave",
    "",
    undefined,
    3,
    {},
  ]) {
    assert.match(
      problem(key, true) ?? "",
      /not a setting of this extension/u,
      String(key),
    );
  }
});

test("values of the wrong type, outside the enum or outside minimum and maximum are refused", () => {
  assert.ok(problem("lumiere.pdf.keyboardShortcuts", "yes"));
  assert.ok(problem("lumiere.pdf.keyboardShortcuts", null));
  assert.ok(problem("lumiere.pdf.view.smoothScrolling", "banana"));
  assert.ok(problem("lumiere.pdf.view.pageLayout", "triple"));
  assert.ok(problem("lumiere.pdf.view.pageLayout", 1));
  assert.ok(problem("lumiere.pdf.view.defaultZoom", "huge"));
  assert.ok(problem("lumiere.pdf.view.defaultZoom", 24));
  assert.ok(problem("lumiere.pdf.view.defaultZoom", 401));
  assert.ok(problem("lumiere.pdf.view.defaultZoom", Number.NaN));
  assert.ok(problem("lumiere.pdf.view.defaultZoom", Infinity));
  assert.ok(problem("lumiere.pdf.view.defaultZoom", { a: 1 }));
  assert.ok(problem("lumiere.pdf.regionImageCache.maxSizeMB", 0));
  assert.ok(problem("lumiere.pdf.regionImageCache.maxSizeMB", "100"));
  assert.ok(problem("lumiere.pdf.toolbar.mode", ["chrome"]));
  assert.ok(problem("lumiere.pdf.toolbar.mode", undefined));
});

test("every contributed setting accepts its own default", () => {
  for (const [key, property] of Object.entries(properties)) {
    assert.equal(
      writeProblem(properties, key, property.default),
      undefined,
      key,
    );
  }
});
