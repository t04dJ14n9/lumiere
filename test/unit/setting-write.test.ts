import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type SchemaProperty, writeProblem } from '../../src/shared/setting-schema';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  contributes: { configuration: { properties: Record<string, SchemaProperty> } | { properties: Record<string, SchemaProperty> }[] };
};
const configuration = manifest.contributes.configuration;
const properties = Object.assign({}, ...(Array.isArray(configuration) ? configuration : [configuration]).map(section => section.properties)) as Record<string, SchemaProperty>;
const problem = (key: unknown, value: unknown) => writeProblem(properties, key, value);

test('a settings write passes only for a contributed key and a value that fits its schema', () => {
  assert.equal(problem('pdfWorkshop.keyboardShortcuts', false), undefined);
  assert.equal(problem('pdfWorkshop.view.smoothScrolling', null), undefined);
  assert.equal(problem('pdfWorkshop.view.defaultZoom', 'fitPage'), undefined);
  assert.equal(problem('pdfWorkshop.view.defaultZoom', 250), undefined);
  assert.equal(problem('pdfWorkshop.view.pageLayout', 'spreadCover'), undefined);
  assert.equal(problem('pdfWorkshop.regionImageCache.maxSizeMB', 50), undefined);
});

test('keys outside the extension, unknown keys and inherited names are refused', () => {
  for (const key of ['editor.fontSize', 'markdownWorkbench.editor.fontSize', 'pdfWorkshop.nope', 'pdfWorkshop.', 'pdfWorkshop.constructor', 'pdfWorkshop.__proto__', 'files.autoSave', '', undefined, 3, {}]) {
    assert.match(problem(key, true) ?? '', /not a setting of this extension/u, String(key));
  }
});

test('values of the wrong type, outside the enum or outside minimum and maximum are refused', () => {
  assert.ok(problem('pdfWorkshop.keyboardShortcuts', 'yes'));
  assert.ok(problem('pdfWorkshop.keyboardShortcuts', null));
  assert.ok(problem('pdfWorkshop.view.smoothScrolling', 'banana'));
  assert.ok(problem('pdfWorkshop.view.pageLayout', 'triple'));
  assert.ok(problem('pdfWorkshop.view.pageLayout', 1));
  assert.ok(problem('pdfWorkshop.view.defaultZoom', 'huge'));
  assert.ok(problem('pdfWorkshop.view.defaultZoom', 24));
  assert.ok(problem('pdfWorkshop.view.defaultZoom', 401));
  assert.ok(problem('pdfWorkshop.view.defaultZoom', Number.NaN));
  assert.ok(problem('pdfWorkshop.view.defaultZoom', Infinity));
  assert.ok(problem('pdfWorkshop.view.defaultZoom', { a: 1 }));
  assert.ok(problem('pdfWorkshop.regionImageCache.maxSizeMB', 0));
  assert.ok(problem('pdfWorkshop.regionImageCache.maxSizeMB', '100'));
  assert.ok(problem('pdfWorkshop.toolbar.mode', ['chrome']));
  assert.ok(problem('pdfWorkshop.toolbar.mode', undefined));
});

test('every contributed setting accepts its own default', () => {
  for (const [key, property] of Object.entries(properties)) {
    assert.equal(writeProblem(properties, key, property.default), undefined, key);
  }
});
