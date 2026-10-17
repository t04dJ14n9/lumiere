import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentReference } from "../../src/shared/agent-reference-input";

test("agent references retain ranges, spaces, Unicode and literal filename punctuation", () => {
  assert.deepEqual(parseAgentReference("@notes/空 格 #draft.md#12-18"), {
    location: "notes/空 格 #draft.md",
    isUri: false,
    startLine: 12,
    endLine: 18,
  });
  assert.deepEqual(parseAgentReference("'@notes\\a.md#2'"), {
    location: "notes/a.md",
    isUri: false,
    startLine: 2,
    endLine: 2,
  });
  for (const quoted of ['"@a.md#1"', "`@a.md#1`", "“@a.md#1”", "‘@a.md#1’"]) {
    assert.equal(parseAgentReference(quoted).location, "a.md");
  }
});

test("full URI references keep authority, escaping and query text", () => {
  const location =
    "vscode-remote://ssh-remote+dev/notes/a%20b.md?revision=full";
  assert.deepEqual(parseAgentReference(`@${location}#30-32`), {
    location,
    isUri: true,
    startLine: 30,
    endLine: 32,
  });
  assert.equal(
    parseAgentReference("file:///C:/notes/a.md#3").location,
    "file:///C:/notes/a.md",
  );
});

test("malformed references and workspace escapes are rejected", () => {
  for (const value of [
    "",
    "@a.md",
    "@a.md#0",
    "@a.md#2-1",
    "@a.md#1-2-3",
    "@a.md#1.5",
    "@a.md#9007199254740992",
    "@../private.md#1",
    "@notes/../a.md#1",
    "@/outside/a.md#1",
    "@\\outside.md#1",
    "@a.md\n#1",
    "@a.md#1\n> passage",
    '"@a.md#1',
    "@file:///a b.md#1",
    "C:/notes/a.md#3",
    "C:\\notes\\a.md#3",
    "file:///n/a.md#x#3",
    `@${"a".repeat(32769)}.md#1`,
  ]) {
    assert.throws(() => parseAgentReference(value), value);
  }
});
