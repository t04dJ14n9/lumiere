import test from "node:test";
import assert from "node:assert/strict";
import {
  documentWarmEnabled,
  isWarmableMarkdown,
  shouldWarmUri,
} from "../../../src/host/document-warm-policy";

test("auto warms only in Cursor; on and off are explicit", () => {
  assert.equal(documentWarmEnabled({ mode: "auto", appName: "Cursor" }), true);
  assert.equal(
    documentWarmEnabled({ mode: "auto", appName: "Visual Studio Code" }),
    false,
  );
  assert.equal(
    documentWarmEnabled({ mode: "on", appName: "Visual Studio Code" }),
    true,
  );
  assert.equal(documentWarmEnabled({ mode: "off", appName: "Cursor" }), false);
});

test("only file Markdown notes are warmable", () => {
  assert.equal(isWarmableMarkdown("file:///vault/Note.md"), true);
  assert.equal(isWarmableMarkdown("file:///vault/Note.markdown"), true);
  assert.equal(isWarmableMarkdown("file:///vault/a.ts"), false);
  assert.equal(isWarmableMarkdown("untitled:Untitled-1"), false);
  assert.equal(isWarmableMarkdown("git:/vault/Note.md"), false);
});

test("already-open documents are not warmed again", () => {
  const note = "file:///vault/Note.md";
  assert.equal(shouldWarmUri(note, new Set()), true);
  assert.equal(shouldWarmUri(note, new Set([note])), false);
  assert.equal(shouldWarmUri("file:///vault/a.ts", new Set()), false);
});
