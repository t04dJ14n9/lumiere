import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { Session } from "../../../src/plugins/document/session";
import { saveDocument } from "../../../src/plugins/document/save";
import { documentHost } from "../../../src/plugins/document/host";
import type { Documents } from "../../../src/plugins/document/api";
import type { HostDocument } from "../../../src/shared/runtime";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";
test("document actions serialize across panels and a rejected action does not poison later actions", async () => {
  const session = new Session(fakeDocument(), fakeWorkbench());
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = session.withAction(async () => {
    order.push("first");
    await gate;
    order.push("finished");
    throw new Error("failed");
  });
  const rejected = assert.rejects(first, /failed/);
  const second = session.withAction(async () => {
    order.push("second");
    return 2;
  });
  await Promise.resolve();
  assert.deepEqual(order, ["first"]);
  release();
  await rejected;
  assert.equal(await second, 2);
  assert.deepEqual(order, ["first", "finished", "second"]);
});
test("a failed final document flush rejects native save despite event listener error isolation", async () => {
  let willSave!: (document: HostDocument) => Promise<void>;
  const workshop = fakeWorkbench({
    onWillSave(listener) {
      willSave = listener;
      return () => {};
    },
  });
  const root = Context.create();
  root.provide("workshop", workshop);
  root.plugin(documentHost);
  await root.settled();
  const doc = fakeDocument();
  const session = (root.runtime.value("documents") as Documents).session(doc);
  session.flush = async () => {
    throw new Error("still syncing");
  };
  await assert.rejects(willSave(doc), /still syncing/);
  await root.dispose();
});
test("overlapping saves wait for the actual saved event and release their listener", async () => {
  let saved!: (document: HostDocument) => void;
  let listeners = 0;
  const workshop = fakeWorkbench({
    onSave(listener) {
      listeners++;
      saved = listener;
      return () => {
        listeners--;
      };
    },
  });
  const doc = fakeDocument({
    async save() {
      setTimeout(() => saved(doc), 5);
      return false;
    },
  });
  assert.equal(await saveDocument(doc, workshop), true);
  assert.equal(listeners, 0);
});
test("save failure releases subscriptions without declaring the document saved", async () => {
  let listeners = 0;
  const workshop = fakeWorkbench({
    onSave() {
      listeners++;
      return () => {
        listeners--;
      };
    },
  });
  await assert.rejects(
    saveDocument(
      fakeDocument({
        async save() {
          throw new Error("disk error");
        },
      }),
      workshop,
    ),
    /disk error/,
  );
  assert.equal(listeners, 0);
});
