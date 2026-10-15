import test from "node:test";
import assert from "node:assert/strict";
import {
  handOffSelection,
  type HandoffSurface,
  type NativeDocument,
} from "../../../src/plugins/cursorBridge/handoff";

function positionAt(text: string, offset: number) {
  let line = 0;
  let character = 0;
  for (let i = 0; i < offset; i++) {
    const ch = text[i];
    if (ch === "\n") {
      line++;
      character = 0;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") {
        character++;
        continue;
      }
      line++;
      character = 0;
      continue;
    }
    character++;
  }
  return { line, character };
}

function fakeDocument(
  uri: string,
  text: string,
  version: number,
): NativeDocument {
  return {
    uri,
    version,
    getText: () => text,
    positionAt: (offset) => positionAt(text, offset),
  };
}

test("handoff acquires a lease and mirrors a CRLF selection", async () => {
  const text = "one\r\ntwo\r\nthree";
  const from = 5;
  const to = 8;
  const leases: string[] = [];
  const handoff: HandoffSurface = {
    acquireLease(uri) {
      leases.push(uri);
    },
    async warm() {},
    async open() {
      return fakeDocument("file:///vault/Note.md", text, 3);
    },
    async show(document, range) {
      return {
        document,
        selection: { start: range.start, end: range.end },
      };
    },
  };
  const result = await handOffSelection(handoff, "file:///vault/Note.md", {
    from,
    to,
    text: "two",
    version: 3,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(leases, ["file:///vault/Note.md"]);
  if (result.ok) {
    assert.deepEqual(result.editor.selection.start, positionAt(text, from));
    assert.deepEqual(result.editor.selection.end, positionAt(text, to));
  }
});

test("handoff fails closed when the document changes during warm", async () => {
  let version = 1;
  let current = "hello world";
  const leases: string[] = [];
  const handoff: HandoffSurface = {
    acquireLease(uri) {
      leases.push(uri);
    },
    async warm() {
      version = 2;
      current = "hello there";
    },
    async open() {
      return fakeDocument("file:///vault/Note.md", current, version);
    },
    async show() {
      assert.fail("show must not run after a version change");
    },
  };
  const result = await handOffSelection(handoff, "file:///vault/Note.md", {
    from: 6,
    to: 11,
    text: "world",
    version: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "changed" });
  assert.deepEqual(leases, ["file:///vault/Note.md"]);
});

test("handoff fails closed on surrogate-pair text mismatch", async () => {
  const text = "A😀B";
  const handoff: HandoffSurface = {
    acquireLease() {},
    async warm() {},
    async open() {
      return fakeDocument("file:///vault/Note.md", text, 1);
    },
    async show() {
      assert.fail("show must not run");
    },
  };
  const result = await handOffSelection(handoff, "file:///vault/Note.md", {
    from: 1,
    to: 3,
    text: "XY",
    version: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "changed" });
});

test("handoff allows a dirty buffer when version and text still match", async () => {
  const text = "draft line";
  const handoff: HandoffSurface = {
    acquireLease() {},
    async warm() {},
    async open() {
      return fakeDocument("file:///vault/Note.md", text, 7);
    },
    async show(document, range) {
      return {
        document,
        selection: { start: range.start, end: range.end },
      };
    },
  };
  const result = await handOffSelection(handoff, "file:///vault/Note.md", {
    from: 0,
    to: 5,
    text: "draft",
    version: 7,
  });
  assert.equal(result.ok, true);
});

test("handoff fails when the mirrored editor selection is wrong", async () => {
  const text = "abcdef";
  const handoff: HandoffSurface = {
    acquireLease() {},
    async warm() {},
    async open() {
      return fakeDocument("file:///vault/Note.md", text, 1);
    },
    async show(document) {
      return {
        document,
        selection: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      };
    },
  };
  const result = await handOffSelection(handoff, "file:///vault/Note.md", {
    from: 2,
    to: 4,
    text: "cd",
    version: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "inactive" });
});
