import assert from "node:assert/strict";
import { test } from "node:test";
import "./support/install-fake-vscode";
import { extensionManifest } from "./support/manifest";
import { PdfSettings } from "../../src/extension/settings";

const settings = new PdfSettings({
  id: "t04dj14n9.vscode-workshop",
  packageJSON: extensionManifest(),
});

test("the PDF settings commands see only the PDF settings of the merged extension", () => {
  const keys = Object.keys(settings.properties());
  assert.ok(keys.includes("pdfWorkshop.keyboardShortcuts"));
  assert.ok(keys.length > 10);
  assert.deepEqual(
    keys.filter((key) => !key.startsWith("pdfWorkshop.")),
    [],
  );
  assert.equal(
    settings.searchFilter,
    "@ext:t04dj14n9.vscode-workshop pdfWorkshop.",
  );
});

test("a Markdown setting cannot be written through the PDF settings", async () => {
  await assert.rejects(
    settings.update("markdownWorkshop.preset", "minimal"),
    /.+/,
  );
});
