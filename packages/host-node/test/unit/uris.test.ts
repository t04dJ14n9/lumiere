import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { nodeFiles } from "../../src/host/node-platform";
import {
  fileUri,
  joinUri,
  parentUri,
  uriName,
  uriPath,
} from "../../src/host/uris";

const NAMES = [
  "a.md",
  "sub/b c.md",
  "../outside.md",
  "./x/../y.md",
  "Q #1? 50%.md",
  "Café/naïve.md",
  "a+b & c=d @$,;'!()*.md",
  "Paper [draft] | v2 ~ old.md",
];

test("joining a link onto a folder URI matches path.join and pathToFileURL", () => {
  const folder = pathToFileURL("/vault/daily notes").toString();
  for (const relative of NAMES) {
    assert.equal(
      joinUri(nodeFiles, folder, relative),
      pathToFileURL(path.posix.join("/vault/daily notes", relative)).toString(),
      relative,
    );
  }
  assert.equal(
    joinUri(nodeFiles, folder, "sub/.."),
    pathToFileURL("/vault/daily notes").toString(),
  );
});

test("a URI's folder and name", () => {
  const note = pathToFileURL("/vault/daily notes/Q #1.md").toString();
  assert.equal(
    parentUri(nodeFiles, note),
    pathToFileURL("/vault/daily notes").toString(),
  );
  assert.equal(
    parentUri(nodeFiles, pathToFileURL("/vault").toString()),
    "file:///",
  );
  assert.equal(uriName(note), "Q #1.md");
});

test("without Node, a path's URI is the one Node 26's pathToFileURL gives", () => {
  for (let code = 32; code < 127; code++) {
    const file = `/v/x${String.fromCharCode(code)}y.md`;
    if (!file.slice(3).includes("/")) {
      assert.equal(fileUri(file), pathToFileURL(file).toString(), file);
    }
  }
  assert.equal(fileUri("/v/é ü.md"), pathToFileURL("/v/é ü.md").toString());
});

test("a URI's path resolves dot segments and refuses hidden separators", () => {
  assert.equal(uriPath("file:///v/a/../b%20c.md"), "/v/b c.md");
  assert.equal(uriPath("file:///v/a/%2e%2e/b.md"), "/v/b.md");
  assert.throws(() => uriPath("file:///v/a%2F..%2F..%2Fx.md"), TypeError);
  assert.throws(() => uriPath("file:///v/a%5c..%5cx.md"), TypeError);
  assert.throws(() => uriPath("https://example.com/v/a.md"), TypeError);
});
