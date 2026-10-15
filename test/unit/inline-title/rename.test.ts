import test from "node:test";
import assert from "node:assert/strict";
import { TitleRenames } from "../../../src/plugins/inlineTitle/rename";
import { TitleTransfers } from "../../../src/plugins/inlineTitle/transfers";
import { CancelToken } from "../../../src/shared/rpc/endpoint";
import { viewState } from "../../../src/plugins/editor/protocol";
import type {
  EditorPanel,
  Editors,
  ViewSnapshot,
} from "../../../src/plugins/editor/api";
import type { DocumentSession } from "../../../src/plugins/document/api";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";

function fixture() {
  let version = 3;
  const doc = {
    ...fakeDocument({ uri: "file:///vault/Old.md" }),
    get version() {
      return version;
    },
  };
  const events: string[] = [];
  const session = {
    flush: async () => {
      events.push("flush");
    },
    withAction: async <T>(action: () => Promise<T>) => action(),
  } as DocumentSession;
  const panels = [1, 2].map(
    (column) =>
      ({
        id: `old-${column}`,
        column,
        document: doc,
        session,
        active: () => column === 1,
      }) as EditorPanel,
  );
  const snapshots = new Map(
    panels.map((panel) => [
      panel.id,
      {
        editorId: panel.id,
        documentUri: doc.uri,
        documentVersion: 3,
        state: viewState.parse({
          anchor: panel.column!,
          head: 0,
          scrollTop: panel.column! + 0.5,
          mode: "source",
        }),
      } satisfies ViewSnapshot,
    ]),
  );
  const editors: Editors = {
    all: () => panels,
    active: () => panels[0],
    capture: async (id) => snapshots.get(id)!,
    restore: async () => {},
  };
  const workshop = fakeWorkbench({
    renameFile: async (_doc, target) => {
      events.push(`rename:${target}`);
    },
    execute: async (_command, _uri, _type, options) => {
      events.push(`open:${(options as { viewColumn: number }).viewColumn}`);
    },
  });
  const renames = new TitleRenames(editors, workshop, async () => {
    events.push("restore");
  });
  return {
    panels,
    snapshots,
    editors,
    workshop,
    renames,
    events,
    change: () => {
      version++;
    },
  };
}

test("renaming flushes and transfers two panels independently, opening the active group last", async () => {
  const f = fixture();
  const target = await f.renames.rename({
    panel: f.panels[0]!,
    title: "New",
    token: new CancelToken(),
  });
  assert.equal(target, "file:///vault/New.md");
  assert.deepEqual(f.events, [
    "flush",
    "rename:file:///vault/New.md",
    "open:2",
    "restore",
    "open:1",
    "restore",
  ]);
  for (const column of [2, 1]) {
    const restored = f.renames.transfers.take({
      id: `new-${column}`,
      column,
      document: fakeDocument({ uri: target }),
    });
    assert.equal(restored?.snapshot.editorId, `old-${column}`);
    assert.equal(restored?.snapshot.state.scrollTop, column + 0.5);
    assert.equal(restored?.focus, column === 1 ? "body" : undefined);
  }
});

test("rename refuses stale capture, cancellation and failed native edits without leaking transfers", async () => {
  const stale = fixture();
  stale.editors.capture = async (id) => {
    stale.change();
    return stale.snapshots.get(id)!;
  };
  await assert.rejects(
    stale.renames.rename({
      panel: stale.panels[0]!,
      title: "New",
      token: new CancelToken(),
    }),
    /changed/,
  );
  assert.deepEqual(stale.events, ["flush"]);
  const cancelled = fixture();
  const token = new CancelToken();
  token.cancel();
  await assert.rejects(
    cancelled.renames.rename({
      panel: cancelled.panels[0]!,
      title: "New",
      token,
    }),
    /cancelled/,
  );
  assert.deepEqual(cancelled.events, ["flush"]);
  const failed = fixture();
  failed.workshop.renameFile = async () => {
    throw new Error("exists");
  };
  await assert.rejects(
    failed.renames.rename({
      panel: failed.panels[0]!,
      title: "New",
      token: new CancelToken(),
    }),
    /exists/,
  );
  assert.equal(
    failed.renames.transfers.take({
      id: "new",
      column: 1,
      document: fakeDocument({ uri: "file:///vault/New.md" }),
    }),
    undefined,
  );
});

test("transfers cannot be consumed by another document or editor group", () => {
  const f = fixture();
  const transfers = new TitleTransfers();
  transfers.set("old", {
    target: "file:///vault/New.md",
    column: 2,
    snapshot: f.snapshots.get("old-2")!,
    focus: "properties",
  });
  assert.equal(
    transfers.take({
      id: "new",
      column: 1,
      document: fakeDocument({ uri: "file:///vault/New.md" }),
    }),
    undefined,
  );
  assert.equal(
    transfers.take({ id: "new", column: 2, document: fakeDocument() }),
    undefined,
  );
  assert.equal(
    transfers.take({
      id: "new",
      column: 2,
      document: fakeDocument({ uri: "file:///vault/New.md" }),
    })?.focus,
    "properties",
  );
});
