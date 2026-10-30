import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pluginsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/webview/plugins.ts",
);

test("viewerPlugins registers History then Annotation after Selection", () => {
  const source = readFileSync(pluginsPath, "utf8");
  assert.match(source, /@embedpdf\/plugin-history\/react/);
  assert.match(source, /@embedpdf\/plugin-annotation\/react/);
  assert.match(source, /HistoryPluginPackage/);
  assert.match(source, /AnnotationPluginPackage/);
  // Registration order in viewerPlugins (ignore import lines).
  const body = source.slice(source.indexOf("export function viewerPlugins"));
  const selection = body.indexOf("SelectionPluginPackage");
  const history = body.indexOf("HistoryPluginPackage");
  const annotation = body.indexOf("AnnotationPluginPackage");
  assert.ok(selection > 0 && history > selection && annotation > history);
  assert.match(source, /annotationAuthor:\s*["']Lumière["']/);
  assert.match(source, /autoCommit:\s*true/);
});
