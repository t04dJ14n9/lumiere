import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import {
  shouldApplyBlame,
  shouldInvalidateCaret,
} from "../../../src/plugins/gitBlame/epoch";
import { BlameController } from "../../../src/plugins/gitBlame/controller";
import {
  blameField,
  docVersionField,
  setBlame,
} from "../../../src/plugins/gitBlame/state";
import type {
  GitBlameLineResult,
  GitBlameOk,
} from "../../../src/shared/git-blame";
import { MAX_DIFF_CHARS } from "../../../src/shared/diff";

const blame: GitBlameOk = {
  commit: "a".repeat(40),
  shortCommit: "aaaaaaa",
  authorName: "Ada",
  authorEmail: "ada@example.com",
  authorDate: 1700000000,
  subject: "Hello",
  line: 3,
};
function result(line = 3, repoGeneration = 0): GitBlameLineResult {
  return { status: "ok", blame: { ...blame, line }, repoGeneration };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

function harness() {
  let uri = "file:///a.md";
  let state = EditorState.create({
    doc: Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join(
      "\n",
    ),
    extensions: [blameField, docVersionField],
  });
  state = state.update({ selection: { anchor: state.doc.line(3).from } }).state;
  const timers = new Set<() => void>();
  const requests: {
    line: number;
    contents: string;
    version: number;
    response: ReturnType<typeof deferred<GitBlameLineResult>>;
  }[] = [];
  const controller = new BlameController({
    read: () => {
      const head = state.selection.main.head;
      return {
        uri,
        docVersion: state.field(docVersionField),
        caretLine: state.doc.lineAt(head).number,
        caretHead: head,
      };
    },
    contents: () => state.doc.toString(),
    request: (params) => {
      const response = deferred<GitBlameLineResult>();
      requests.push({ ...params, response });
      return response.promise;
    },
    paint: (value) => {
      state = state.update({ effects: setBlame.of(value) }).state;
    },
    after: (callback, ms) => {
      assert.equal(ms, 150);
      timers.add(callback);
      return () => {
        timers.delete(callback);
      };
    },
  });
  return {
    controller,
    requests,
    timers,
    state: () => state,
    ghost: () => state.field(blameField),
    unlock() {
      // Same-line column nudge unlocks only-after-caret-move without line change.
      const line = state.doc.lineAt(state.selection.main.head);
      const head = state.selection.main.head;
      const next = head <= line.from ? Math.min(line.to, line.from + 1) : line.from;
      state = state.update({ selection: { anchor: next } }).state;
      controller.update();
    },
    async paint() {
      if (!controller.allowsPaint) {
        this.unlock();
        // Drop the unlock schedule; paint() refreshes immediately.
        timers.clear();
      }
      const pending = controller.refresh();
      requests
        .at(-1)!
        .response.resolve(
          result(controller.epoch.caretLine, controller.epoch.repoGeneration),
        );
      await pending;
    },
    edit() {
      state = state.update({ changes: { from: 0, insert: "edit " } }).state;
      controller.update();
    },
    caret(line: number, column = 0) {
      state = state.update({
        selection: { anchor: state.doc.line(line).from + column },
      }).state;
      controller.update();
    },
    switchUri() {
      uri = "file:///b.md";
      controller.update();
    },
    fire() {
      const callbacks = [...timers];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}


test("no ghost until a real caret move (open/restored caret stays quiet)", async () => {
  const h = harness();
  assert.equal(h.controller.allowsPaint, false);
  await h.controller.refresh();
  assert.equal(h.requests.length, 0);
  assert.equal(h.ghost(), null);
  assert.equal(h.controller.allowsPaint, false);
  h.controller.dispose();
});

test("same-line column move unlocks and paints current line", async () => {
  const h = harness();
  assert.equal(h.controller.allowsPaint, false);
  h.unlock();
  assert.equal(h.controller.allowsPaint, true);
  assert.equal(h.timers.size, 1);
  h.fire();
  h.requests.at(-1)!.response.resolve(result(3, 0));
  await tick();
  assert.ok(h.ghost());
  assert.equal(h.ghost()?.line, 3);
  h.controller.dispose();
});

test("line change also unlocks and paints the new line", async () => {
  const h = harness();
  h.caret(6);
  assert.equal(h.controller.allowsPaint, true);
  h.fire();
  h.requests.at(-1)!.response.resolve(result(6, 0));
  await tick();
  assert.ok(h.ghost());
  assert.equal(h.ghost()?.line, 6);
  h.controller.dispose();
});

test("URI switch re-locks until the next caret move", async () => {
  const h = harness();
  await h.paint();
  assert.ok(h.ghost());
  const requestsBefore = h.requests.length;
  h.switchUri();
  assert.equal(h.controller.allowsPaint, false);
  assert.equal(h.ghost(), null);
  h.fire();
  await tick();
  // Locked refresh skips host work.
  assert.equal(h.requests.length, requestsBefore);
  assert.equal(h.ghost(), null);
  h.unlock();
  h.fire();
  h.requests.at(-1)!.response.resolve(result(3, 0));
  await tick();
  assert.ok(h.ghost());
  h.controller.dispose();
});

test("B2 tuple rejects doc, caret-line and repository drift", () => {
  const epoch = { docVersion: 1, caretLine: 3, repoGeneration: 7 };
  assert.equal(shouldApplyBlame(epoch, epoch), true);
  assert.equal(shouldApplyBlame(epoch, { ...epoch, docVersion: 2 }), false);
  assert.equal(shouldApplyBlame(epoch, { ...epoch, caretLine: 20 }), false);
  assert.equal(shouldApplyBlame(epoch, { ...epoch, repoGeneration: 8 }), false);
  assert.equal(shouldInvalidateCaret(3, 20), true);
  assert.equal(shouldInvalidateCaret(3, 3), false);
});

test("doc edit clears synchronously before refresh; late same-line ok stays empty", async () => {
  const h = harness();
  await h.paint();
  const pending = h.controller.refresh();
  const oldVersion = h.requests.at(-1)!.version;
  h.edit();
  assert.equal(h.ghost(), null);
  assert.equal(h.controller.epoch.docVersion, oldVersion + 1);
  assert.equal(h.timers.size, 1);
  h.requests.at(-1)!.response.resolve(result());
  await pending;
  assert.equal(h.ghost(), null);
  h.fire();
  assert.equal(h.requests.at(-1)!.version, oldVersion + 1);
  assert.match(h.requests.at(-1)!.contents, /^edit /);
  h.controller.dispose();
});

test("caret 3 → 20 clears immediately, invalidates serial, and requests line 20", async () => {
  const h = harness();
  await h.paint();
  const pending = h.controller.refresh();
  const request = h.requests.at(-1)!;
  const serial = h.controller.requestSerial;
  h.caret(20);
  assert.equal(h.ghost(), null);
  assert.ok(h.controller.requestSerial > serial);
  assert.equal(h.controller.epoch.caretLine, 20);
  request.response.resolve(result(3));
  await pending;
  assert.equal(h.ghost(), null);
  h.fire();
  assert.equal(h.requests.at(-1)!.line, 20);
  h.controller.dispose();
});

test("same-line selection is a no-op for decoration, serial and requests", async () => {
  const h = harness();
  await h.paint();
  const serial = h.controller.requestSerial;
  h.caret(3, 2);
  assert.ok(h.ghost());
  assert.equal(h.controller.requestSerial, serial);
  assert.equal(h.timers.size, 0);
  h.controller.dispose();
});

test("repo changed clears immediately; an intervening changed prevents adoption", async () => {
  const h = harness();
  await h.paint();
  const pending = h.controller.refresh();
  const old = h.requests.at(-1)!;
  h.controller.repositoryChanged(8);
  assert.equal(h.ghost(), null);
  assert.equal(h.controller.epoch.repoGeneration, 8);
  old.response.resolve(result(3, 9));
  await pending;
  assert.equal(h.ghost(), null);
  assert.equal(h.controller.epoch.repoGeneration, 8);
  h.fire();
  h.requests.at(-1)!.response.resolve(result(3, 8));
  await tick();
  assert.ok(h.ghost());
  h.controller.dispose();
});

test("disable cancels timer and invalidates a matching numeric epoch late ok", async () => {
  const h = harness();
  await h.paint();
  const pending = h.controller.refresh();
  const serial = h.controller.requestSerial;
  h.controller.dispose();
  assert.equal(h.ghost(), null);
  assert.equal(h.timers.size, 0);
  assert.ok(h.controller.requestSerial > serial);
  h.requests.at(-1)!.response.resolve(result());
  await pending;
  assert.equal(h.ghost(), null);
  await h.controller.refresh();
  assert.equal(h.requests.length, 2);
});

test("URI change invalidates late ok even with the same public B2 tuple", async () => {
  const h = harness();
  await h.paint();
  const pending = h.controller.refresh();
  const old = h.requests.at(-1)!;
  const epoch = h.controller.epoch;
  const serial = h.controller.requestSerial;
  h.switchUri();
  assert.deepEqual(h.controller.epoch, epoch);
  assert.ok(h.controller.requestSerial > serial);
  assert.equal(h.ghost(), null);
  old.response.resolve(result());
  await pending;
  assert.equal(h.ghost(), null);
  h.controller.dispose();
});

test("latest rejection soft-hides; obsolete R1 rejection cannot erase R2", async () => {
  const h = harness();
  h.unlock();
  h.timers.clear();
  const r1 = h.controller.refresh();
  const old = h.requests.at(-1)!;
  h.edit();
  h.fire();
  const current = h.requests.at(-1)!;
  current.response.resolve(result());
  await tick();
  const painted = h.ghost();
  assert.ok(painted);
  old.response.reject(new Error("obsolete"));
  await r1;
  assert.equal(h.ghost(), painted);
  const r3 = h.controller.refresh();
  h.requests.at(-1)!.response.reject(new Error("current"));
  await assert.doesNotReject(r3);
  assert.equal(h.ghost(), null);
  h.controller.dispose();
});

test("first current response adopts authoritative generation on startup/re-entry", async () => {
  for (const generation of [7, 19]) {
    const h = harness();
    assert.equal(h.controller.epoch.repoGeneration, 0);
    h.unlock();
    h.timers.clear();
    const pending = h.controller.refresh();
    h.requests.at(-1)!.response.resolve(result(3, generation));
    await pending;
    assert.ok(h.ghost());
    assert.equal(h.controller.epoch.repoGeneration, generation);
    h.controller.dispose();
  }
});

test("a newer request wins within the same epoch; old success is a no-op", async () => {
  const h = harness();
  h.unlock();
  h.timers.clear();
  const r1 = h.controller.refresh();
  const old = h.requests.at(-1)!;
  await h.paint();
  const painted = h.ghost();
  old.response.resolve({
    ...result(),
    blame: { ...blame, subject: "obsolete" },
  } as GitBlameLineResult);
  await r1;
  assert.equal(h.ghost(), painted);
  h.controller.dispose();
});

test("non-ok statuses and over-cap RPC rejection stay visually quiet", async () => {
  for (const status of [
    "uncommitted",
    "untracked",
    "unavailable",
    "empty",
    "stale",
  ] as const) {
    const h = harness();
    await h.paint();
    const pending = h.controller.refresh();
    h.requests.at(-1)!.response.resolve({ status, repoGeneration: 0 });
    await pending;
    assert.equal(h.ghost(), null);
    h.controller.dispose();
  }
  let painted: GitBlameOk | null = blame;
  let calls = 0;
  let head = 0;
  const controller = new BlameController({
    read: () => ({
      uri: "file:///a",
      docVersion: 1,
      caretLine: 1,
      caretHead: head,
    }),
    contents: () => "x".repeat(MAX_DIFF_CHARS + 1),
    request: async () => {
      calls++;
      throw new Error("schema over cap");
    },
    paint: (value) => {
      painted = value;
    },
    after: () => () => {},
  });
  head = 1;
  controller.update();
  await controller.refresh();
  assert.equal(painted, null);
  assert.equal(calls, 0);
  controller.dispose();
});
