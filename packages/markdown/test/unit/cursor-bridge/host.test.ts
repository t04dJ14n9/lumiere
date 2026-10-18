import { provideHostServices } from "../../../src/shared/host";
import test from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import { cursorBridgeHost } from "../../../src/plugins/cursorBridge/host";
import { CURSOR_COMMANDS } from "../../../src/plugins/cursorBridge/cursor";
import type {
  HandoffSurface,
  NativeDocument,
  NativeEditor,
} from "../../../src/plugins/cursorBridge/handoff";
import type { EditorPanel } from "../../../src/plugins/editor/api";
import { Lease } from "../../../src/host/reclaim-policy";
import { contributionId } from "../../../src/shared/setting-schema";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";

type FixtureOptions = {
  /** Command ids advertised by agentHost.environment(); default = all CURSOR_COMMANDS. */
  commands?: ReadonlySet<string>;
  /** When true, executing the Edit command throws (simulates a missing handler). */
  editThrows?: boolean;
  /**
   * Edit return values in call order. `undefined` / missing = silent no-op.
   * Default: every call returns a prompt-bar id (verifiable success).
   */
  editResults?: unknown[];
};

async function fixture(options: FixtureOptions = {}) {
  const root = createRoot();
  const handlers = new Map<string, () => unknown>();
  const events: string[] = [];
  const errors: string[] = [];
  const informs: string[] = [];
  const dismissed: string[] = [];
  const lease = new Lease();
  const note = "file:///vault/Note.md";
  const editArgs: unknown[] = [];
  let editCalls = 0;
  const state = {
    uri: note,
    version: 1,
    text: "abcdef",
    isActive: true,
    selectionEmpty: false,
    cursor: 2,
    range: {
      start: { line: 0, character: 2 },
      end: { line: 0, character: 4 },
    },
    beforeDiscovery: undefined as (() => Promise<void>) | undefined,
    afterValidation: undefined as (() => void) | undefined,
    languageId: "plaintext",
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
      return state.isActive;
    },
  };
  const surface: HandoffSurface = {
    acquireLease(uri) {
      events.push("lease");
      return lease.acquire(uri);
    },
    nativeUri(uri) {
      return { scheme: "file", path: uri, toString: () => uri };
    },
    async warm() {
      events.push("warm");
    },
    async open() {
      events.push("open");
      // Mimic host openMarkdownDocument forcing markdown language.
      state.languageId = "markdown";
      return document;
    },
    async show(_document, range) {
      events.push("show");
      state.range = range;
      const change = state.afterValidation;
      state.afterValidation = undefined;
      if (change) {
        // Apply after show resolves and before the host's confirmActiveEditor
        // (await boundary flushes this microtask).
        queueMicrotask(change);
      }
      return editor;
    },
    async dismiss(uri) {
      events.push("dismiss");
      dismissed.push(uri);
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
      return {
        editorId: panel.id,
        documentUri: note,
        documentVersion: state.version,
        state: {
          source: "Note.md",
          anchor: state.cursor,
          head: state.cursor,
          scrollTop: 0,
          scrollLeft: 0,
          contributions: {},
          mode: "livePreview",
          folded: [],
          folds: {},
        },
      };
    },
    async restore() {},
  });
  root.provide("selections", {
    async capture() {
      if (state.selectionEmpty) {
        return undefined;
      }
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
  const discovered =
    options.commands ?? new Set(Object.values(CURSOR_COMMANDS));
  provideHostServices(
    root,
    fakeHost({
      hostCommands: {
        register(id, run) {
          handlers.set(id, run);
          return () => {
            handlers.delete(id);
          };
        },
        async execute(id, ...args) {
          events.push(id);
          if (id === CURSOR_COMMANDS.edit) {
            editArgs.push(...args);
            if (options.editThrows) {
              throw new Error(`command '${id}' not found`);
            }
            if (options.editResults) {
              const result = options.editResults[editCalls];
              editCalls++;
              return result;
            }
            editCalls++;
            return "prompt-bar-id";
          }
        },
      },
      dialogs: {
        error(message) {
          errors.push(message);
        },
        inform(message) {
          informs.push(message);
        },
      },
      settings: {
        forNote: () => ({ preset: "obsidian", mode: "livePreview" }),
      },
      agentHost: {
        async environment() {
          events.push("commands");
          await state.beforeDiscovery?.();
          return {
            target: "cursor",
            agentExtensions: new Set(),
            commands: discovered,
            hasChatParticipant: false,
            chatDisabled: false,
          };
        },
      },
    }),
  );
  root.plugin(cursorBridgeHost, { appName: "Cursor", surface });
  await root.settled();
  events.length = 0;
  return {
    root,
    handlers,
    events,
    errors,
    informs,
    dismissed,
    editArgs,
    lease,
    state,
    note,
  };
}

test("Edit prefers override-only (no show) when Cursor returns a prompt-bar id", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  let release = () => {};
  const discovery = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.after(release);
  f.state.beforeDiscovery = () => discovery;
  const pending = f.handlers.get(contributionId("cursorBridge.edit"))!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(f.events, ["commands"]);
  assert.equal(f.lease.has(f.note), false);
  release();
  await pending;
  assert.deepEqual(f.events, [
    "commands",
    "lease",
    "warm",
    "open",
    CURSOR_COMMANDS.edit,
  ]);
  assert.equal(f.events.includes("show"), false);
  assert.equal(f.editArgs.length, 1);
  const args = f.editArgs[0] as {
    invocationType: string;
    overrideUri: { toString(): string };
    overrideRange: object;
  };
  assert.equal(args.invocationType, "new");
  assert.equal(args.overrideUri.toString(), f.note);
  assert.deepEqual(args.overrideRange, {
    startLineNumber: 1,
    startColumn: 3,
    endLineNumber: 1,
    endColumn: 5,
  });
  assert.equal(f.lease.has(f.note), true);
  assert.equal(f.state.languageId, "markdown");
  assert.deepEqual(f.errors, []);
});

test("Chat discovers commands before handoff and keeps the lease after invocation", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  let release = () => {};
  const discovery = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.after(release);
  f.state.beforeDiscovery = () => discovery;
  const pending = f.handlers.get(contributionId("cursorBridge.chat"))!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(f.events, ["commands"]);
  assert.equal(f.lease.has(f.note), false);
  release();
  await pending;
  assert.deepEqual(f.events, [
    "commands",
    "lease",
    "warm",
    "open",
    "show",
    CURSOR_COMMANDS.chat,
  ]);
  assert.equal(f.lease.has(f.note), true);
  assert.deepEqual(f.errors, []);
});

for (const change of [
  "active editor",
  "uri",
  "version",
  "text",
  "range",
] as const) {
  test(`Edit is not invoked on handoff if ${change} changes after override-only fails`, async (t) => {
    const f = await fixture({ editResults: [undefined] });
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
    await f.handlers.get(contributionId("cursorBridge.edit"))!();
    assert.ok(f.events.includes(CURSOR_COMMANDS.edit));
    assert.ok(f.events.includes("show"));
    assert.ok(f.events.includes("dismiss"));
    assert.equal(f.errors.length, 1);
    assert.equal(f.lease.has(f.note), false);
    // Second Edit attempt must not run after confirm fails.
    assert.equal(
      f.events.filter((event) => event === CURSOR_COMMANDS.edit).length,
      1,
    );
  });
}

test("failed second same-URI Edit keeps the first handoff lease", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.equal(f.lease.has(f.note), true);
  assert.deepEqual(f.errors, []);

  f.state.version = 2;
  f.state.text = "abXYef";
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.equal(f.errors.length, 1);
  assert.equal(
    f.lease.has(f.note),
    true,
    "overlapping failure must not drop the open Edit lease",
  );
});

test("Chat opens without a selection and does not hand off the note or acquire a lease", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  f.state.selectionEmpty = true;
  await f.handlers.get(contributionId("cursorBridge.chat"))!();
  assert.deepEqual(f.events, ["commands", CURSOR_COMMANDS.chat]);
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.errors, []);
});

test("Edit mirrors an empty caret with source coordinates via override-only", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  f.state.selectionEmpty = true;
  f.state.text = "ab\r\ncdef";
  f.state.cursor = 4;
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.deepEqual(f.events, [
    "commands",
    "lease",
    "warm",
    "open",
    CURSOR_COMMANDS.edit,
  ]);
  const args = f.editArgs[0] as { overrideRange: object };
  assert.deepEqual(args.overrideRange, {
    startLineNumber: 1,
    startColumn: 6,
    endLineNumber: 1,
    endColumn: 6,
  });
  assert.equal(f.lease.has(f.note), true);
  assert.deepEqual(f.errors, []);
});

test("silent Edit failure abandons the mirror and falls back to Chat", async (t) => {
  const f = await fixture({ editResults: [undefined, undefined] });
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.ok(f.events.includes("lease"));
  assert.ok(f.events.includes("open"));
  assert.ok(f.events.includes("show"));
  assert.equal(
    f.events.filter((event) => event === CURSOR_COMMANDS.edit).length,
    2,
    "override-only then handoff Edit",
  );
  assert.ok(f.events.includes("dismiss"));
  assert.ok(f.events.includes(CURSOR_COMMANDS.chat));
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.dismissed, [f.note]);
  assert.equal(f.errors.length, 0);
  assert.ok(
    f.informs.some((message) => message.includes("Cursor Edit is unavailable")),
  );
});

test("Edit throws after handoff: release lease, dismiss mirror, Chat fallback", async (t) => {
  const f = await fixture({ editThrows: true });
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.ok(f.events.includes("lease"));
  // Override-only throws → treated as failure → show → Edit throws again.
  assert.ok(f.events.includes("show"));
  assert.ok(f.events.includes(CURSOR_COMMANDS.edit));
  assert.ok(f.events.includes("dismiss"));
  assert.ok(f.events.includes(CURSOR_COMMANDS.chat));
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.dismissed, [f.note]);
  assert.equal(f.errors.length, 0);
  assert.ok(
    f.informs.some((message) => message.includes("Cursor Edit is unavailable")),
  );
});

test("override-only silent fail then handoff Edit success keeps the lease", async (t) => {
  const f = await fixture({ editResults: [undefined, "prompt-bar-retry"] });
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.deepEqual(
    f.events.filter((event) =>
      [
        "lease",
        "warm",
        "open",
        "show",
        CURSOR_COMMANDS.edit,
        "dismiss",
      ].includes(event),
    ),
    [
      "lease",
      "warm",
      "open",
      CURSOR_COMMANDS.edit,
      "show",
      CURSOR_COMMANDS.edit,
    ],
  );
  assert.equal(f.lease.has(f.note), true);
  assert.deepEqual(f.dismissed, []);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.informs, []);
});

test("missing Edit command skips handoff and opens Chat without a lease", async (t) => {
  const f = await fixture({
    commands: new Set([CURSOR_COMMANDS.chat, CURSOR_COMMANDS.chatFallback]),
  });
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.deepEqual(f.events, ["commands", CURSOR_COMMANDS.chat]);
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.dismissed, []);
  assert.equal(f.editArgs.length, 0);
  assert.ok(
    f.informs.some((message) => message.includes("Cursor Edit is unavailable")),
  );
});

test("empty-caret silent Edit failure dismisses and does not leave an orphan lease", async (t) => {
  const f = await fixture({ editResults: [undefined, undefined] });
  t.after(() => f.root.dispose());
  f.state.selectionEmpty = true;
  f.state.text = "abcdef";
  f.state.cursor = 3;
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.dismissed, [f.note]);
  assert.ok(f.events.includes(CURSOR_COMMANDS.chat));
});

test("Edit open path forces markdown language on the mirror document", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  f.state.languageId = "plaintext";
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.equal(f.state.languageId, "markdown");
  assert.ok(f.events.includes("open"));
});
