import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmActiveEditor,
  handOffSelection,
  type HandoffSurface,
  type NativeDocument,
  type NativeEditor,
} from "../../../src/plugins/cursorBridge/handoff";
import { Lease } from "../../../src/host/reclaim-policy";

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

const note = "file:///vault/Note.md";

function fixture(text: string, version = 1) {
  const state = {
    uri: note,
    text,
    version,
    isActive: true,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  };
  const leases = new Set<string>();
  const released: string[] = [];
  const document: NativeDocument = {
    get uri() {
      return state.uri;
    },
    get version() {
      return state.version;
    },
    getText: () => state.text,
    positionAt: (offset) => positionAt(state.text, offset),
  };
  const editor: NativeEditor = {
    document,
    get selection() {
      return state.range;
    },
    isActive: () => state.isActive,
  };
  const surface: HandoffSurface = {
    acquireLease: (uri) => {
      leases.add(uri);
    },
    releaseLease: (uri) => {
      leases.delete(uri);
      released.push(uri);
    },
    async warm() {},
    async open() {
      return document;
    },
    async show(_document, range) {
      state.range = range;
      return editor;
    },
  };
  return { state, leases, released, surface, document, editor };
}

test("handoff acquires a lease and mirrors a CRLF selection", async () => {
  const text = "one\r\ntwo\r\nthree";
  const f = fixture(text, 3);
  const result = await handOffSelection(f.surface, note, {
    from: 5,
    to: 8,
    text: "two",
    version: 3,
  });
  assert.equal(result.ok, true);
  assert.deepEqual([...f.leases], [note]);
  assert.deepEqual(f.released, []);
  if (result.ok) {
    assert.deepEqual(result.editor.selection.start, positionAt(text, 5));
    assert.deepEqual(result.editor.selection.end, positionAt(text, 8));
  }
});

test("handoff releases the lease when the document changes during warm", async () => {
  const f = fixture("hello world");
  f.surface.warm = async () => {
    f.state.version = 2;
    f.state.text = "hello there";
  };
  f.surface.show = async () => {
    assert.fail("show must not run after a version change");
  };
  const result = await handOffSelection(f.surface, note, {
    from: 6,
    to: 11,
    text: "world",
    version: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "changed" });
  assert.equal(f.leases.size, 0);
  assert.deepEqual(f.released, [note]);
});

test("handoff releases the lease on surrogate-pair text mismatch", async () => {
  const f = fixture("A😀B");
  f.surface.show = async () => {
    assert.fail("show must not run on a text mismatch");
  };
  const result = await handOffSelection(f.surface, note, {
    from: 1,
    to: 3,
    text: "XY",
    version: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "changed" });
  assert.equal(f.leases.size, 0);
  assert.deepEqual(f.released, [note]);
});

test("handoff allows a dirty buffer when version and text still match", async () => {
  const f = fixture("draft line", 7);
  const result = await handOffSelection(f.surface, note, {
    from: 0,
    to: 5,
    text: "draft",
    version: 7,
  });
  assert.equal(result.ok, true);
  assert.equal(f.leases.has(note), true);
  assert.deepEqual(f.released, []);
});

test("handoff releases the lease when the mirrored selection is wrong", async () => {
  const f = fixture("abcdef");
  f.surface.show = async () => {
    f.state.range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    };
    return f.editor;
  };
  const result = await handOffSelection(f.surface, note, {
    from: 2,
    to: 4,
    text: "cd",
    version: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "inactive" });
  assert.equal(f.leases.size, 0);
  assert.deepEqual(f.released, [note]);
});

test("handoff requires the mirrored editor to be active", async () => {
  const f = fixture("abcdef");
  f.state.isActive = false;
  const result = await handOffSelection(f.surface, note, {
    from: 2,
    to: 4,
    text: "cd",
    version: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "inactive" });
  assert.equal(f.leases.size, 0);
  assert.deepEqual(f.released, [note]);
});

test("handoff releases the lease on an out-of-bounds range", async () => {
  const f = fixture("abcdef");
  const result = await handOffSelection(f.surface, note, {
    from: 2,
    to: 9,
    text: "cdef",
    version: 1,
  });
  assert.deepEqual(result, { ok: false, reason: "mismatch" });
  assert.equal(f.leases.size, 0);
  assert.deepEqual(f.released, [note]);
});

for (const stage of ["warm", "open", "show"] as const) {
  test(`handoff releases the lease when ${stage} throws`, async () => {
    const f = fixture("abcdef");
    f.surface[stage] = async () => {
      throw new Error(`${stage} failed`);
    };
    await assert.rejects(
      handOffSelection(f.surface, note, {
        from: 2,
        to: 4,
        text: "cd",
        version: 1,
      }),
      new RegExp(`${stage} failed`),
    );
    assert.equal(f.leases.size, 0);
    assert.deepEqual(f.released, [note]);
  });
}

test("failed second same-URI handoff keeps the first lease held", async () => {
  const lease = new Lease();
  const released: string[] = [];
  const f = fixture("abcdef");
  f.surface.acquireLease = (uri) => {
    lease.acquire(uri);
  };
  f.surface.releaseLease = (uri) => {
    lease.release(uri);
    released.push(uri);
  };
  const selection = { from: 2, to: 4, text: "cd", version: 1 };
  const first = await handOffSelection(f.surface, note, selection);
  assert.equal(first.ok, true);
  assert.equal(lease.has(note), true);

  f.surface.warm = async () => {
    f.state.version = 2;
  };
  f.surface.show = async () => {
    assert.fail("show must not run after a version change");
  };
  const second = await handOffSelection(f.surface, note, {
    ...selection,
    version: 1,
  });
  assert.deepEqual(second, { ok: false, reason: "changed" });
  assert.equal(lease.has(note), true, "first Edit session lease must survive");
  assert.deepEqual(released, [note]);
});

for (const change of [
  "active editor",
  "uri",
  "version",
  "text",
  "range",
] as const) {
  test(`final revalidation fails closed if ${change} changes after handoff`, async () => {
    const f = fixture("abcdef");
    const selection = { from: 2, to: 4, text: "cd", version: 1 };
    const handoff = await handOffSelection(f.surface, note, selection);
    assert.equal(handoff.ok, true);
    if (!handoff.ok) {
      return;
    }
    assert.equal(confirmActiveEditor(handoff.editor, note, selection).ok, true);

    // Model work queued after handoff validation but before Cursor invocation.
    await Promise.resolve().then(() => {
      if (change === "active editor") {
        f.state.isActive = false;
      } else if (change === "uri") {
        f.state.uri = "file:///vault/Other.md";
      } else if (change === "version") {
        f.state.version++;
      } else if (change === "text") {
        f.state.text = "abXYef";
      } else {
        f.state.range = {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        };
      }
    });
    const reason =
      change === "active editor" || change === "range" ? "inactive" : "changed";
    assert.deepEqual(confirmActiveEditor(handoff.editor, note, selection), {
      ok: false,
      reason,
    });
  });
}
