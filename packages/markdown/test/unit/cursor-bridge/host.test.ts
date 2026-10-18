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
import type { EditPromptVisibility } from "../../../src/plugins/cursorBridge/handoff";
import {
  EDIT_PROMPT_ARMED,
  EDIT_PROMPT_VIEW,
} from "../../../src/plugins/cursorBridge/edit-prompt-probe";
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
  const contexts: unknown[][] = [];
  const statusShows: { text: string; tooltip?: string; command?: string }[] =
    [];
  const statusEvents: string[] = [];
  let probeDisposed = false;
  let statusDisposed = false;
  const probe: EditPromptVisibility = {
    visible: false,
    onVisibilityChanged: () => () => {},
  };
  const editWatchers: { uri: string; onEnd(): void; isDisposed: boolean }[] =
    [];
  const lease = new Lease();
  const note = "file:///vault/Note.md";
  const editArgs: unknown[][] = [];
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
    watchEditEnd(uri, onEnd, prompt) {
      assert.equal(prompt.onVisibilityChanged, probe.onVisibilityChanged);
      const watcher = { uri, onEnd, isDisposed: false };
      editWatchers.push(watcher);
      return {
        dispose() {
          watcher.isDisposed = true;
        },
      };
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
      views: {
        tree(id, source) {
          assert.equal(id, EDIT_PROMPT_VIEW);
          assert.deepEqual(source.roots(), []);
          assert.deepEqual(source.children({ id: "unused", label: "" }), []);
          return {
            ...probe,
            refresh() {},
            setMessage() {},
            async reveal() {
              assert.fail("the probe must never reveal or take focus");
            },
            dispose() {
              probeDisposed = true;
            },
          };
        },
        status(id, priority, options) {
          assert.equal(id, contributionId("cursorBridge.dismissEditMirror"));
          assert.equal(priority, 1000);
          assert.deepEqual(options, { alignment: "left" });
          return {
            show(text, tooltip, command) {
              statusShows.push({ text, tooltip, command });
              statusEvents.push("show");
            },
            hide() {
              statusEvents.push("hide");
            },
            dispose() {
              statusDisposed = true;
              statusEvents.push("dispose");
            },
          };
        },
      },
      hostCommands: {
        register(id, run) {
          handlers.set(id, run);
          return () => {
            handlers.delete(id);
          };
        },
        async execute(id, ...args) {
          if (id === "setContext") {
            contexts.push(args);
            return;
          }
          events.push(id);
          if (id === CURSOR_COMMANDS.edit) {
            editArgs.push(args);
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
    contexts,
    get probeDisposed() {
      return probeDisposed;
    },
    get statusDisposed() {
      return statusDisposed;
    },
    handlers,
    events,
    errors,
    informs,
    dismissed,
    editWatchers,
    statusShows,
    statusEvents,
    surface,
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
  const args = f.editArgs[0]?.[0] as {
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
  assert.equal(f.editWatchers.length, 1);
  assert.deepEqual(f.dismissed, []);
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
  assert.equal(f.editWatchers.length, 0, "Chat keeps its existing lifetime");
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
    assert.equal(f.editWatchers.length, 0);
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
  const args = f.editArgs[0]?.[0] as { overrideRange: object };
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
  assert.equal(f.editArgs.length, 2);
  assert.deepEqual(f.editArgs[1], []);
  assert.ok(f.events.includes("dismiss"));
  assert.ok(f.events.includes(CURSOR_COMMANDS.chat));
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.dismissed, [f.note]);
  assert.equal(f.editWatchers.length, 0);
  assert.equal(
    f.contexts.some(
      ([key, value]) => key === EDIT_PROMPT_ARMED && value === true,
    ),
    false,
  );
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
  assert.equal(f.editWatchers.length, 0);
  assert.equal(
    f.contexts.some(
      ([key, value]) => key === EDIT_PROMPT_ARMED && value === true,
    ),
    false,
  );
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
  assert.equal(f.editArgs.length, 2);
  const override = f.editArgs[0]?.[0] as {
    overrideUri: { toString(): string };
  };
  assert.equal(override.overrideUri.toString(), f.note);
  assert.deepEqual(f.editArgs[1], []);
  assert.equal(f.lease.has(f.note), true);
  assert.deepEqual(f.dismissed, []);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.informs, []);
  assert.equal(f.editWatchers.length, 1);
});

for (const path of ["override-only", "focused editor"] as const) {
  test(`Edit success on ${path} releases its token and dismisses once on Edit end`, async (t) => {
    const f = await fixture({
      editResults:
        path === "override-only" ? ["prompt"] : [undefined, "prompt"],
    });
    t.after(() => f.root.dispose());
    await f.handlers.get(contributionId("cursorBridge.edit"))!();
    assert.equal(f.lease.has(f.note), true);
    assert.deepEqual(f.dismissed, []);
    const watcher = f.editWatchers[0];
    assert.ok(watcher);
    assert.equal(watcher.uri, f.note);
    assert.deepEqual(
      f.contexts.filter(([key]) => key === EDIT_PROMPT_ARMED),
      [
        [EDIT_PROMPT_ARMED, false],
        [EDIT_PROMPT_ARMED, true],
      ],
    );
    watcher.onEnd();
    assert.deepEqual(f.contexts.at(-1), [EDIT_PROMPT_ARMED, false]);
    assert.equal(f.lease.has(f.note), false, "release precedes dismissal");
    assert.deepEqual(f.dismissed, [f.note]);
    assert.equal(watcher.isDisposed, true);
    watcher.onEnd();
    assert.deepEqual(f.dismissed, [f.note], "late callbacks are harmless");
  });
}

test("a new Edit cancels the same-URI watcher and releases only the replaced token", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  const chatLease = f.lease.acquire(f.note);
  chatLease.promote();
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  const first = f.editWatchers[0];
  assert.ok(first);
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.equal(first.isDisposed, true);
  assert.deepEqual(
    f.contexts.filter(([key]) => key === EDIT_PROMPT_ARMED),
    [
      [EDIT_PROMPT_ARMED, false],
      [EDIT_PROMPT_ARMED, true],
      [EDIT_PROMPT_ARMED, false],
      [EDIT_PROMPT_ARMED, true],
    ],
  );
  first.onEnd();
  assert.deepEqual(f.dismissed, []);
  const second = f.editWatchers[1];
  assert.ok(second);
  second.onEnd();
  assert.deepEqual(f.dismissed, [f.note]);
  assert.equal(f.lease.has(f.note), true, "Chat's token survives Edit cleanup");
  chatLease.release();
  assert.equal(f.lease.has(f.note), false, "neither Edit token leaks");
});

test("a failed replacement abandons once and stale success callbacks cannot dismiss again", async (t) => {
  const f = await fixture({ editResults: ["first", undefined, undefined] });
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  const first = f.editWatchers[0];
  assert.ok(first);
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.equal(first.isDisposed, true);
  assert.equal(f.editWatchers.length, 1, "failure does not arm a watcher");
  assert.deepEqual(f.contexts.at(-1), [EDIT_PROMPT_ARMED, false]);
  assert.equal(f.lease.has(f.note), false);
  first.onEnd();
  assert.deepEqual(f.dismissed, [f.note]);
});

test("stopping the plugin cancels Edit cleanup without dismissing a tab", async () => {
  const f = await fixture();
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  await f.root.dispose();
  assert.equal(f.probeDisposed, true);
  assert.deepEqual(
    f.contexts.filter(([key]) => key === EDIT_PROMPT_ARMED).at(-1),
    [EDIT_PROMPT_ARMED, false],
  );
  const watcher = f.editWatchers[0];
  assert.ok(watcher);
  assert.equal(watcher.isDisposed, true);
  watcher.onEnd();
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.dismissed, []);
});

test("Edit-end dismissal is best-effort after releasing the token", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  f.surface.dismiss = async () => {
    throw new Error("tab is already gone");
  };
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  f.editWatchers[0]?.onEnd();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.lease.has(f.note), false);
  assert.equal(f.editWatchers[0]?.isDisposed, true);
});

test("Edit ending during watcher registration cannot leave the probe armed", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  let isDisposed = false;
  f.surface.watchEditEnd = (_uri, onEnd) => {
    onEnd();
    return {
      dispose() {
        isDisposed = true;
      },
    };
  };
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.equal(isDisposed, true);
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.dismissed, [f.note]);
  assert.deepEqual(
    f.contexts.filter(([key]) => key === EDIT_PROMPT_ARMED),
    [[EDIT_PROMPT_ARMED, false]],
  );
});

test("Edit finishing preparation after plugin shutdown cannot arm a watcher", async (t) => {
  const f = await fixture();
  let resume = () => {};
  f.surface.warm = () =>
    new Promise<void>((resolve) => {
      resume = resolve;
    });
  t.after(resume);
  const pending = f.handlers.get(contributionId("cursorBridge.edit"))!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await f.root.dispose();
  resume();
  await pending;
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.editWatchers, []);
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

test("Edit success shows the left status-bar dismiss control", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.deepEqual(f.statusEvents, ["show"]);
  assert.equal(f.statusShows.length, 1);
  assert.equal(f.statusShows[0]?.text, "$(markdown) Return to Lumière");
  assert.equal(
    f.statusShows[0]?.command,
    contributionId("cursorBridge.dismissEditMirror"),
  );
  assert.ok(f.statusShows[0]?.tooltip?.includes("Edit mirror"));
});

test("status-bar click abandons the armed mirror and hides the control", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.equal(f.lease.has(f.note), true);
  await f.handlers.get(contributionId("cursorBridge.dismissEditMirror"))!();
  assert.equal(f.lease.has(f.note), false);
  assert.deepEqual(f.dismissed, [f.note]);
  assert.deepEqual(f.statusEvents, ["show", "hide"]);
  assert.equal(f.editWatchers[0]?.isDisposed, true);
  // A second click with nothing armed is a no-op.
  await f.handlers.get(contributionId("cursorBridge.dismissEditMirror"))!();
  assert.deepEqual(f.dismissed, [f.note]);
  assert.deepEqual(f.statusEvents, ["show", "hide"]);
});

test("replacement disposes the prior status ownership then shows again", async (t) => {
  const f = await fixture();
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.deepEqual(f.statusEvents, ["show", "hide", "show"]);
  assert.equal(f.statusShows.length, 2);
  await f.handlers.get(contributionId("cursorBridge.dismissEditMirror"))!();
  assert.deepEqual(f.dismissed, [f.note]);
  assert.deepEqual(f.statusEvents, ["show", "hide", "show", "hide"]);
});

test("failed Edit never shows the dismiss status bar", async (t) => {
  const f = await fixture({ editResults: [undefined, undefined] });
  t.after(() => f.root.dispose());
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  assert.deepEqual(f.statusEvents, []);
  assert.deepEqual(f.statusShows, []);
});

test("stopping the plugin disposes the dismiss status bar", async () => {
  const f = await fixture();
  await f.handlers.get(contributionId("cursorBridge.edit"))!();
  await f.root.dispose();
  assert.equal(f.statusDisposed, true);
  assert.ok(f.statusEvents.includes("dispose"));
  assert.ok(f.statusEvents.includes("hide"));
});
