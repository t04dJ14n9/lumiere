import test from "node:test";
import assert from "node:assert/strict";
import { Context } from "../../../src/kernel";
import { cursorBridgeHost } from "../../../src/plugins/cursorBridge/host";
import { CURSOR_COMMANDS } from "../../../src/plugins/cursorBridge/cursor";
import type {
  HandoffSurface,
  NativeDocument,
  NativeEditor,
} from "../../../src/plugins/cursorBridge/handoff";
import type { EditorPanel } from "../../../src/plugins/editor/api";
import { Lease } from "../../../src/host/reclaim-policy";
import { fakeDocument, fakeWorkbench } from "../../support/vscode-fake";

async function fixture() {
  const root = Context.create();
  const handlers = new Map<string, () => unknown>();
  const events: string[] = [];
  const errors: string[] = [];
  const lease = new Lease();
  const note = "file:///vault/Note.md";
  const state = {
    uri: note,
    version: 1,
    text: "abcdef",
    isActive: true,
    range: {
      start: { line: 0, character: 2 },
      end: { line: 0, character: 4 },
    },
    beforeDiscovery: undefined as (() => Promise<void>) | undefined,
    afterValidation: undefined as (() => void) | undefined,
  };
  const document: NativeDocument = {
    get uri() {
      return state.uri;
    },
    get version() {
      return state.version;
    },
    getText: () => state.text,
    positionAt: (offset) => ({ line: 0, character: offset }),
  };
  const editor: NativeEditor = {
    document,
    get selection() {
      return state.range;
    },
    isActive() {
      const isActive = state.isActive;
      const change = state.afterValidation;
      state.afterValidation = undefined;
      if (change) {
        // Change focus/document/selection after handoff's check but before
        // its caller resumes, without importing the VS Code runtime.
        queueMicrotask(change);
      }
      return isActive;
    },
  };
  const surface: HandoffSurface = {
    acquireLease(uri) {
      events.push("lease");
      return lease.acquire(uri);
    },
    async warm() {
      events.push("warm");
    },
    async open() {
      return document;
    },
    async show(_document, range) {
      events.push("show");
      state.range = range;
      return editor;
    },
  };
  const panel = {
    id: "panel",
    document: fakeDocument({ uri: note, getText: () => state.text }),
  } as EditorPanel;
  root.provide("editors", {
    active: () => panel,
    all: () => [panel],
    async capture() {
      throw new Error("unused");
    },
    async restore() {},
  });
  root.provide("selections", {
    async capture() {
      return {
        id: "selection",
        editorId: panel.id,
        documentId: panel.document.id,
        isDirty: true,
        version: 1,
        from: 2,
        to: 4,
        startLine: 1,
        endLine: 1,
        text: "cd",
      };
    },
    validate: () => panel,
  });
  root.provide(
    "workbench",
    fakeWorkbench({
      command(id, run) {
        handlers.set(id, run);
        return () => {
          handlers.delete(id);
        };
      },
      async execute(id) {
        events.push(id);
      },
      error(message) {
        errors.push(message);
      },
      config: () => ({ preset: "obsidian", mode: "livePreview" }),
      async agentEnvironment() {
        events.push("commands");
        await state.beforeDiscovery?.();
        return {
          target: "cursor",
          agentExtensions: new Set(),
          commands: new Set(Object.values(CURSOR_COMMANDS)),
          hasChatParticipant: false,
          chatDisabled: false,
        };
      },
    }),
  );
  root.plugin(cursorBridgeHost, { appName: "Cursor", surface });
  await root.settled();
  events.length = 0;
  return { root, handlers, events, errors, lease, state, note };
}

for (const mode of ["chat", "edit"] as const) {
  test(`${mode} discovers commands before handoff and keeps the lease after invocation`, async (t) => {
    const f = await fixture();
    t.after(() => f.root.dispose());
    let release = () => {};
    const discovery = new Promise<void>((resolve) => {
      release = resolve;
    });
    t.after(release);
    f.state.beforeDiscovery = () => discovery;
    const pending = f.handlers.get(`markdownWorkbench.cursorBridge.${mode}`)!();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(f.events, ["commands"]);
    assert.equal(f.lease.has(f.note), false);
    release();
    await pending;
    assert.deepEqual(f.events, [
      "commands",
      "lease",
      "warm",
      "show",
      CURSOR_COMMANDS[mode],
    ]);
    assert.equal(f.lease.has(f.note), true);
    assert.deepEqual(f.errors, []);
  });
}

for (const change of [
  "active editor",
  "uri",
  "version",
  "text",
  "range",
] as const) {
  test(`Edit is not invoked if ${change} changes after handoff validation`, async (t) => {
    const f = await fixture();
    t.after(() => f.root.dispose());
    f.state.afterValidation = () => {
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
    };
    await f.handlers.get("markdownWorkbench.cursorBridge.edit")!();
    assert.deepEqual(f.events, ["commands", "lease", "warm", "show"]);
    assert.equal(f.errors.length, 1);
    assert.equal(f.lease.has(f.note), false);
  });
}

test("failed second same-URI Edit keeps the first handoff lease", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  await f.handlers.get("markdownWorkbench.cursorBridge.edit")!();
  assert.equal(f.lease.has(f.note), true);
  assert.deepEqual(f.errors, []);

  f.state.version = 2;
  f.state.text = "abXYef";
  await f.handlers.get("markdownWorkbench.cursorBridge.edit")!();
  assert.equal(f.errors.length, 1);
  assert.equal(
    f.lease.has(f.note),
    true,
    "overlapping failure must not drop the open Edit lease",
  );
});
