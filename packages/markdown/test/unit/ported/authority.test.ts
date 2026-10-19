import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collab,
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
} from "@codemirror/collab";
import { ChangeSet, EditorState } from "@codemirror/state";
import { Authority } from "../../../src/shared/document/authority";
import { difference } from "../../../src/shared/document/wire";
import { createRenderer } from "../../../src/markdown/html";
const { renderMarkdown } = createRenderer();

function sync(state: EditorState, authority: Authority): EditorState {
  return state.update(
    receiveUpdates(
      state,
      authority.since(getSyncedVersion(state)).map((update) => ({
        clientID: update.clientID,
        changes: ChangeSet.fromJSON(update.changes),
      })),
    ),
  ).state;
}
function push(state: EditorState, authority: Authority, id: string): void {
  const pending = authority.prepare(
    getSyncedVersion(state),
    sendableUpdates(state).map((update) => update.changes.toJSON()),
    id,
  );
  if (pending) {
    authority.record(pending.text.toString(), pending);
  }
}

test("delayed acknowledgements preserve edits typed after a submitted batch", () => {
  const authority = new Authority("hello");
  let client = EditorState.create({
    doc: "hello",
    extensions: collab({ clientID: "one" }),
  });
  client = client.update({ changes: { from: 5, insert: " world" } }).state;
  push(client, authority, "one");
  client = client.update({ changes: { from: 11, insert: "!" } }).state;
  client = sync(client, authority);
  assert.equal(client.doc.toString(), "hello world!");
  assert.equal(sendableUpdates(client).length, 1);
  push(client, authority, "one");
  client = sync(client, authority);
  assert.equal(authority.doc.toString(), "hello world!");
  assert.equal(sendableUpdates(client).length, 0);
});

test("two split views converge when both edit before receiving the other change", () => {
  const authority = new Authority("middle");
  let a = EditorState.create({
    doc: "middle",
    extensions: collab({ clientID: "a" }),
  });
  let b = EditorState.create({
    doc: "middle",
    extensions: collab({ clientID: "b" }),
  });
  a = a.update({ changes: { from: 0, insert: "first " } }).state;
  b = b.update({ changes: { from: 6, insert: " last" } }).state;
  push(a, authority, "a");
  push(b, authority, "b");
  a = sync(a, authority);
  b = sync(b, authority);
  assert.equal(authority.doc.toString(), "first middle last");
  assert.equal(a.doc.toString(), b.doc.toString());
  assert.equal(a.doc.toString(), authority.doc.toString());
});

test("external changes are rebased against unconfirmed typing", () => {
  const authority = new Authority("start");
  let client = EditorState.create({
    doc: "start",
    extensions: collab({ clientID: "one" }),
  });
  client = client.update({ changes: { from: 5, insert: " typed" } }).state;
  authority.record("external start");
  client = sync(client, authority);
  push(client, authority, "one");
  client = sync(client, authority);
  assert.equal(authority.doc.toString(), "external start typed");
  assert.equal(client.doc.toString(), authority.doc.toString());
});

test("retried batches are acknowledged once", () => {
  const authority = new Authority("note");
  const change = ChangeSet.of({ from: 4, insert: "!" }, 4).toJSON();
  const prepared = authority.prepare(0, [change], "one")!;
  authority.record(prepared.text.toString(), prepared);
  assert.equal(authority.prepare(0, [change], "one"), undefined);
  assert.equal(authority.doc.toString(), "note!");
  assert.equal(authority.version, 1);
});

test("actual host changes override a mismatched expected edit", () => {
  const authority = new Authority("note");
  const prepared = authority.prepare(
    0,
    [ChangeSet.of({ from: 4, insert: "!" }, 4).toJSON()],
    "one",
  )!;
  authority.record("external note", prepared);
  assert.equal(authority.since(0)[0]?.clientID, "host");
  assert.equal(authority.doc.toString(), "external note");
});

test("multi-transaction batch remains individually confirmable", () => {
  const authority = new Authority("");
  let client = EditorState.create({ extensions: collab({ clientID: "one" }) });
  for (const character of "你好 🧠 مرحبا") {
    client = client.update({
      changes: { from: client.doc.length, insert: character },
    }).state;
  }
  push(client, authority, "one");
  client = sync(client, authority);
  assert.equal(client.doc.toString(), "你好 🧠 مرحبا");
  assert.equal(sendableUpdates(client).length, 0);
});

test("invalid revisions and malformed edit lengths do not mutate the authority", () => {
  const authority = new Authority("note");
  assert.throws(() => authority.prepare(100, [], "one"));
  assert.throws(() => authority.prepare(0, [null], "one"));
  assert.throws(() =>
    authority.prepare(0, [ChangeSet.empty(10).toJSON()], "one"),
  );
  assert.equal(authority.doc.toString(), "note");
});

test("random concurrent insertions, removals and replacements converge", () => {
  let seed = 2911;
  const random = (max: number): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };
  const authority = new Authority("seed");
  let a = EditorState.create({
    doc: "seed",
    extensions: collab({ clientID: "a" }),
  });
  let b = EditorState.create({
    doc: "seed",
    extensions: collab({ clientID: "b" }),
  });
  const edit = (client: EditorState): EditorState => {
    const from = random(client.doc.length + 1);
    return client.update({
      changes: {
        from,
        to: Math.min(client.doc.length, from + random(4)),
        insert: ["x", "你好", "🙂", "\n", ""][random(5)]!,
      },
    }).state;
  };
  for (let round = 0; round < 200; round++) {
    a = edit(a);
    b = edit(b);
    if (round % 3 === 0) {
      authority.record("external\n" + authority.doc.toString());
    }
    push(a, authority, "a");
    push(b, authority, "b");
    a = sync(a, authority);
    b = sync(b, authority);
    assert.equal(a.doc.toString(), authority.doc.toString());
    assert.equal(b.doc.toString(), authority.doc.toString());
  }
});

test("LF transport normalizes CRLF without counting CR as a source character", () => {
  const authority = new Authority("first\r\n你好\r\n");
  assert.equal(authority.doc.toString(), "first\n你好\n");
  assert.equal(authority.doc.line(2).from, 6);
  assert.equal(
    difference("🧠 note", "🧡 note")
      .apply(new Authority("🧠 note").doc)
      .toString(),
    "🧡 note",
  );
});

test("rendering without a DOM sanitizer escapes HTML and rejects script links", () => {
  const result = renderMarkdown(
    "<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![x](https://remote.example/image.png)",
  );
  assert.ok(!result.includes("<script>"));
  assert.ok(!result.includes('href="javascript:'));
  assert.ok(!result.includes('src="https://remote.example'));
  assert.ok(
    result.includes('data-resource="https://remote.example/image.png"'),
  );
});

test("delayed navigation offsets rebase through confirmed source changes", () => {
  const authority = new Authority("one\r\ntwo\r\nthree");
  authority.record("prefix\r\none\r\ntwo\r\nthree");
  assert.deepEqual(authority.mapOffsets(0, [0, 4, 8]), [7, 11, 15]);
  authority.record("prefix\r\none\r\nthree");
  // The canonical text diff keeps the shared "t" of "two" / "three".
  // The later "t" falls inside its deletion and clamps after the retained one.
  assert.deepEqual(authority.mapOffsets(0, [4, 8]), [11, 12]);
  assert.throws(() => authority.mapOffsets(-1, [0]), /revision/);
  assert.throws(() => authority.mapOffsets(0, [100]), /Position/);
});
