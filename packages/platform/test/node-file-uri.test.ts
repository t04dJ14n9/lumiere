import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { pathToFileUriString } from "../src/node/file-uri";

test("file URI conversion supports drive, UNC and native paths with reserved characters", () => {
  assert.equal(
    pathToFileUriString("C:/Users/test/a #%.json"),
    "file:///C:/Users/test/a%20%23%25.json",
  );
  assert.equal(
    pathToFileUriString(String.raw`\\server\share\a #%.json`),
    "file://server/share/a%20%23%25.json",
  );
  for (const path of ["/tmp/a #%.json", "relative file.json"]) {
    assert.equal(pathToFileUriString(path), pathToFileURL(path).href);
  }
});
