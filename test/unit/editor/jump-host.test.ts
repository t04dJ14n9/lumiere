import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { registerJumpHistory } from "../../../src/plugins/editor/jump-host";
import { protocol } from "../../../src/plugins/editor/jump-protocol";
import type { JumpAnchor } from "../../../src/plugins/editor/jump-history";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import type { DocumentSession } from "../../../src/plugins/document/api";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";
import { rpcPair } from "../../support/rpc-pair";

const anchor = (at: number): JumpAnchor => ({
  selection: { anchor: at, head: at },
  scroll: { from: at, offset: -2, left: 0, top: at },
});
async function fixture() {
  const root = Context.create();
  const commands = new Map<string, () => unknown>();
  root.provide(
    "workbench",
    fakeWorkbench({
      command: (id, run) => {
        commands.set(id, run);
        return () => {
          commands.delete(id);
        };
      },
    }),
  );
  let active = "left";
  const make = (id: string) => {
    const pair = rpcPair();
    const document = fakeDocument({ getText: () => "one\r\ntwo\r\nthree" });
    const session = {
      text: "one\ntwo\nthree",
      version: 0,
      flush: async () => {},
      document,
    } as DocumentSession;
    const panel = {
      id,
      document,
      session,
      rpc: pair.host,
      active: () => active === id,
    } as EditorPanel;
    return { pair, panel };
  };
  const left = make("left");
  const right = make("right");
  let panels = [left.panel, right.panel];
  const editors: Editors = {
    all: () => panels,
    active: () => panels.find((pane) => pane.active()),
    capture: async () => {
      throw new Error("Unexpected view snapshot capture");
    },
    restore: async () => {
      throw new Error("Unexpected view snapshot restore");
    },
  };
  root.plugin({
    name: "testHistory",
    inject: { required: ["workbench"] },
    apply(ctx) {
      registerJumpHistory(ctx, editors);
    },
  });
  await root.settled();
  return {
    root,
    commands,
    left,
    right,
    activate(id: string) {
      active = id;
      root.emit("editor/activeChanged", editors.active());
    },
    close(id: string) {
      const panel = panels.find((pane) => pane.id === id)!;
      panels = panels.filter((pane) => pane !== panel);
      root.emit("editor/closed", panel);
    },
    async dispose() {
      await root.dispose();
      await left.pair.dispose();
      await right.pair.dispose();
    },
  };
}

test("host history keeps split cursors independent and ignores empty metadata changes", async () => {
  const f = await fixture();
  let current = anchor(8);
  let changed = false;
  let target = -1;
  f.left.pair.client.handle(protocol, "capture", () => ({
    anchor: current,
    version: 0,
    generation: 3,
    session: "webview",
  }));
  f.left.pair.client.handle(protocol, "restore", (request) => {
    target = request.anchor.selection.head;
    if (!changed) {
      changed = true;
      f.root.emit("document/changed", f.left.panel.session, []);
    }
    current = request.anchor;
    return true;
  });
  await f.left.pair.client.call(protocol, "record", {
    before: anchor(0),
    after: anchor(4),
    version: 0,
  });
  await f.left.pair.client.call(protocol, "record", {
    before: anchor(4),
    after: anchor(8),
    version: 0,
  });
  await f.commands.get("markdownWorkbench.jumpBack")!();
  assert.equal(target, 4, "CRLF source offsets round-trip to editor offsets");
  await f.commands.get("markdownWorkbench.jumpBack")!();
  assert.equal(
    target,
    0,
    "empty change must not prevent the first cursor commit",
  );
  f.activate("right");
  target = -1;
  await f.commands.get("markdownWorkbench.jumpBack")!();
  assert.equal(target, -1);
  await f.dispose();
});

test("switching panes during a capture cancels the old Back without restoring it", async () => {
  const f = await fixture();
  let captured!: () => void;
  const started = new Promise<void>((resolve) => {
    captured = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let restores = 0;
  f.left.pair.client.handle(protocol, "capture", async () => {
    captured();
    await gate;
    return { anchor: anchor(4), version: 0, generation: 0, session: "old" };
  });
  f.left.pair.client.handle(protocol, "restore", () => {
    restores++;
    return true;
  });
  await f.left.pair.client.call(protocol, "record", {
    before: anchor(0),
    after: anchor(4),
    version: 0,
  });
  const pending = f.commands.get("markdownWorkbench.jumpBack")!();
  await started;
  f.activate("right");
  release();
  await pending;
  assert.equal(restores, 0);
  await f.dispose();
});

test("an applied but unacknowledged Back retains its Forward destination", async () => {
  const f = await fixture();
  let current = anchor(8);
  let interrupted = true;
  f.left.pair.client.handle(protocol, "capture", () => ({
    anchor: current,
    version: 0,
    generation: 0,
    session: "webview",
  }));
  f.left.pair.client.handle(protocol, "restore", (request) => {
    current = request.anchor;
    if (interrupted) {
      interrupted = false;
      return false;
    }
    return true;
  });
  await f.left.pair.client.call(protocol, "record", {
    before: anchor(0),
    after: anchor(8),
    version: 0,
  });
  await f.commands.get("markdownWorkbench.jumpBack")!();
  assert.equal(current.selection.head, 0);
  await f.commands.get("markdownWorkbench.jumpBack")!();
  await f.commands.get("markdownWorkbench.jumpForward")!();
  assert.equal(current.selection.head, 8);
  await f.dispose();
});

test("an attempt rejected before movement refreshes the next departure from ordinary reading", async () => {
  const f = await fixture();
  let current = anchor(8);
  let startedAttempt = 0;
  let reject = true;
  f.left.pair.client.handle(protocol, "capture", () => ({
    anchor: current,
    version: 0,
    generation: 0,
    session: "same",
    startedAttempt,
  }));
  f.left.pair.client.handle(protocol, "restore", (request) => {
    if (reject) {
      reject = false;
      return false;
    }
    startedAttempt = request.attempt!;
    current = request.anchor;
    return true;
  });
  await f.left.pair.client.call(protocol, "record", {
    before: anchor(0),
    after: anchor(8),
    version: 0,
  });
  await f.commands.get("markdownWorkbench.jumpBack")!();
  current = anchor(10);
  await f.commands.get("markdownWorkbench.jumpBack")!();
  await f.commands.get("markdownWorkbench.jumpForward")!();
  assert.equal(current.selection.head, 10);
  await f.dispose();
});
