import test from "node:test";
import assert from "node:assert/strict";
import {
  scrubUri,
  scrubDiagnosticMessage,
  scrubPacket,
} from "../../../src/shared/ide-context/scrub";
import { DEFAULT_CAPS } from "../../../src/shared/ide-context/caps";

test("scrubUri strips token-like query keys", () => {
  const out = scrubUri("file:///a.md?token=secret&page=1", 2048);
  assert.equal(out.includes("secret"), false);
  assert.match(out, /page=1|file:\/\/\/a\.md/);
});

test("scrubDiagnosticMessage redacts sk-/ghp_/bearer best-effort", () => {
  const out = scrubDiagnosticMessage(
    "auth Bearer abc sk-123 ghp_xxx done",
    300,
  );
  assert.equal(out.includes("sk-123"), false);
  assert.equal(out.includes("ghp_xxx"), false);
});

test("scrubPacket redacts URI query secrets and diagnostic tokens on a full packet", () => {
  const out = scrubPacket({
    version: 1,
    collectedAt: "2026-10-16T00:00:00.000Z",
    product: "markdownWorkshop",
    markdown: { editorKind: "text" },
    active: { uri: "file:///a.md?token=secret&page=1" },
    tabs: {
      visible: ["file:///b.md?access_token=abc"],
      open: [],
      truncated: false,
    },
    diagnostics: {
      uri: "file:///a.md?token=secret&page=1",
      items: [
        {
          severity: "error",
          message: "auth Bearer xyz sk-leak ghp_leak",
          startLine: 1,
          startCharacter: 0,
        },
      ],
      truncated: false,
    },
    warnings: [],
    caps: DEFAULT_CAPS,
  });
  assert.deepEqual(scrubPacket(out), out);
  assert.equal(JSON.stringify(out).includes("secret"), false);
  assert.equal(JSON.stringify(out).includes("sk-leak"), false);
  assert.equal(JSON.stringify(out).includes("Bearer xyz"), false);
});

test("URI query scrubbing preserves fragments and encoded Windows drives", () => {
  for (const input of [
    "file:///C:/note?token=secret&page=2#heading",
    "file:///c%3A/note?%74oken=secret#heading",
  ]) {
    const out = scrubUri(input, 2048);
    assert.ok(out.endsWith("#heading"));
    assert.ok(!out.includes("secret"));
    assert.equal(scrubUri(out, 2048), out);
    assert.equal(out.split("/note")[0], input.split("/note")[0]);
  }
  assert.equal(
    scrubUri("#heading?token=literal", 2048),
    "#heading?token=literal",
  );
});
test("malformed and truncated URIs stay bounded and idempotent", () => {
  for (const input of [
    "not a URI %ZZ?token=secret#tail",
    "file:///C:/" + "x".repeat(100) + "?page=123456789&token=secret#tail",
    "file:///c%3A/" + "x".repeat(100),
    "???",
    "",
  ]) {
    for (const cap of [0, 5, 20, 2048]) {
      const out = scrubUri(input, cap);
      assert.ok(out.length <= cap);
      assert.equal(scrubUri(out, cap), out);
    }
  }
});
test("empty and already redacted diagnostic messages stay stable", () => {
  assert.equal(scrubDiagnosticMessage("", 20), "");
  for (const cap of [10, 15, 20, 100]) {
    const out = scrubDiagnosticMessage("Bearer secret sk-test ghp_test", cap);
    assert.equal(scrubDiagnosticMessage(out, cap), out);
  }
});

test("truncation cannot reinterpret a fragment as a secret query", () => {
  const input = "file:///" + "x".repeat(100) + "#long-fragment?token=literal";
  const out = scrubUri(input, 25);
  assert.equal(scrubUri(out, 25), out);
});
