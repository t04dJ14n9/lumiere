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
  assert.equal(JSON.stringify(out).includes("secret"), false);
  assert.equal(JSON.stringify(out).includes("sk-leak"), false);
  assert.equal(JSON.stringify(out).includes("Bearer xyz"), false);
});
