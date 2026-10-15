import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import type * as Reclaim from "../../../src/host/reclaim";
import type * as DocumentWarm from "../../../src/host/document-warm";
import type * as Workbench from "../../../src/host/workbench";
import type * as NativePlatform from "../../../src/host/api/native-platform";
import type * as CursorHandoff from "../../../src/host/cursor-handoff";
import type { Uri as NativeUri } from "vscode";
import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";
import {
  confirmActiveEditor,
  handOffSelection,
} from "../../../src/plugins/cursorBridge/handoff";

const { viewType } = MARKDOWN_EDITOR;
class Uri {
  static parse(value: string) {
    return new Uri(value);
  }
  constructor(private readonly value: string) {}
  get scheme() {
    return new URL(this.value).protocol.slice(0, -1);
  }
  get path() {
    return decodeURIComponent(new URL(this.value).pathname);
  }
  toString() {
    return this.value;
  }
}
class TabInputText {
  constructor(readonly uri: Uri) {}
}
class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}
class Range {
  constructor(
    readonly start: Position,
    readonly end: Position,
  ) {}
}
class TabInputCustom {
  constructor(
    readonly uri: Uri,
    readonly viewType: string,
  ) {}
}
class Emitter<T> {
  readonly listeners = new Set<(value: T) => void>();
  readonly event = (listener: (value: T) => void) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(value: T) {
    for (const listener of this.listeners) {
      listener(value);
    }
  }
}
interface Document {
  uri: Uri;
  isDirty: boolean;
}
interface TextEditor {
  document: Document & {
    version: number;
    getText(): string;
    positionAt(offset: number): Position;
  };
  selection: Range;
}
interface Tab {
  input: unknown;
  label: string;
  isDirty: boolean;
  isPreview: boolean;
  group: typeof group;
}
const group = {
  viewColumn: 1,
  tabs: [] as Tab[],
  activeTab: undefined as Tab | undefined,
};
const documents: Document[] = [];
const opened = new Emitter<Document>();
const changedFile = new Emitter<Uri>();
const createdFile = new Emitter<Uri>();
const createdFiles = new Emitter<{ files: Uri[] }>();
const tabsChanged = new Emitter<{
  opened: Tab[];
  changed: Tab[];
  closed: Tab[];
}>();
const warmed: string[] = [];
const commands: unknown[][] = [];
const scopes: { section: string; uri: string | undefined }[] = [];
const settings = new Map<string, unknown>();
let beforeOpen: (() => Promise<void>) | undefined;
let serial = 0;
let note: string;
const vscode = {
  Uri,
  TabInputText,
  TabInputCustom,
  Position,
  Range,
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Disposable: {
    from: (...subscriptions: { dispose(): unknown }[]) => ({
      dispose: () =>
        subscriptions.forEach((subscription) => subscription.dispose()),
    }),
  },
  env: { appName: "Cursor", uriScheme: "cursor" },
  extensions: { getExtension: () => undefined },
  workspace: {
    textDocuments: documents,
    getConfiguration(section: string, uri?: Uri) {
      scopes.push({ section, uri: uri?.toString() });
      return {
        get(key: string, fallback?: unknown) {
          const setting = `${section}.${key}`;
          return (
            settings.get(`${setting}:${uri}`) ??
            settings.get(setting) ??
            fallback
          );
        },
      };
    },
    async openTextDocument(uri: Uri) {
      warmed.push(uri.toString());
      let document = documents.find(
        (candidate) => candidate.uri.toString() === uri.toString(),
      );
      if (!document) {
        document = { uri, isDirty: false };
        documents.push(document);
        opened.fire(document);
      }
      await beforeOpen?.();
      return document;
    },
    onDidOpenTextDocument: opened.event,
    onDidCreateFiles: createdFiles.event,
    createFileSystemWatcher: () => ({
      dispose() {},
      onDidChange: changedFile.event,
      onDidCreate: createdFile.event,
    }),
  },
  window: {
    activeTextEditor: undefined as TextEditor | undefined,
    async showTextDocument(
      document: TextEditor["document"],
      options: { selection: Range },
    ) {
      const editor = { document, selection: options.selection };
      vscode.window.activeTextEditor = editor;
      return editor;
    },
    tabGroups: {
      all: [group],
      activeTabGroup: group,
      onDidChangeTabs: tabsChanged.event,
      async close(tab: Tab) {
        assert.equal(tab.isDirty, false, "dirty tabs must survive the handoff");
        group.tabs = group.tabs.filter((candidate) => candidate !== tab);
      },
    },
  },
  commands: {
    async executeCommand(id: string, uri: Uri, ...args: unknown[]) {
      commands.push([id, uri.toString(), ...args]);
    },
  },
};

function loadHost() {
  const loader = Module as typeof Module & {
    _load(id: string, ...args: unknown[]): unknown;
  };
  const originalLoad = loader._load;
  loader._load = (id, ...args) =>
    id === "vscode" ? vscode : originalLoad.call(Module, id, ...args);
  const require = createRequire(import.meta.url);
  try {
    return {
      reclaim: require("../../../src/host/reclaim.ts") as typeof Reclaim,
      warm: require("../../../src/host/document-warm.ts") as typeof DocumentWarm,
      workbench: require("../../../src/host/workbench.ts") as typeof Workbench,
      api: require("../../../src/host/api/native-platform.ts") as typeof NativePlatform,
      cursorHandoff:
        require("../../../src/host/cursor-handoff.ts") as typeof CursorHandoff,
    };
  } finally {
    loader._load = originalLoad;
  }
}
const host = loadHost();
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  note = `file:///vault/Note-${++serial}.md`;
  warmed.length = 0;
  commands.length = 0;
  documents.length = 0;
  scopes.length = 0;
  group.tabs = [];
  group.activeTab = undefined;
  vscode.window.tabGroups.all = [group];
  vscode.window.activeTextEditor = undefined;
  beforeOpen = undefined;
  vscode.env.appName = "Cursor";
  settings.clear();
  settings.set("workbench.editorAssociations", { "*.md": viewType });
  for (const emitter of [
    opened,
    changedFile,
    createdFile,
    createdFiles,
    tabsChanged,
  ]) {
    emitter.listeners.clear();
  }
});

function cursorTab(uri = note) {
  if (!documents.some((document) => document.uri.toString() === uri)) {
    documents.push({ uri: Uri.parse(uri), isDirty: true });
  }
  const tab: Tab = {
    input: undefined,
    label: Uri.parse(uri).path.split("/").at(-1)!,
    isDirty: true,
    isPreview: false,
    group,
  };
  group.tabs.push(tab);
  group.activeTab = tab;
  return tab;
}

function delayWarm() {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeOpen = () => pending;
  return release;
}

test("an input-less dirty Cursor tab awaits warming before the custom-editor handoff", async (t) => {
  const release = delayWarm();
  t.after(release);
  t.after(() => stop.dispose());
  const stop = host.reclaim.registerReclaim();
  const tab = cursorTab();
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  assert.deepEqual(warmed, [note]);
  assert.deepEqual(commands, []);
  release();
  await tick();
  assert.deepEqual(commands, [
    ["vscode.openWith", note, viewType, { viewColumn: 1, preview: false }],
  ]);
  assert.ok(group.tabs.includes(tab));
  assert.equal(documents[0]?.isDirty, true);
  assert.ok(
    scopes.some(
      (scope) => scope.section === "markdownWorkbench" && scope.uri === note,
    ),
  );

  tab.input = new TabInputCustom(Uri.parse(note), viewType);
  tabsChanged.fire({ opened: [], changed: [tab], closed: [] });
  await tick();
  assert.equal(commands.length, 1, "other → workbench must not loop");
});

test("switching an existing Workbench tab to Cursor Markdown is reclaimed", async (t) => {
  const tab = cursorTab();
  tab.input = new TabInputCustom(Uri.parse(note), viewType);
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  tab.input = undefined;
  tabsChanged.fire({ opened: [], changed: [tab], closed: [] });
  await tick();
  assert.deepEqual(warmed, [note]);
  assert.equal(commands.length, 1);
});

for (const transfer of ["completed", "closed", "another preview"] as const) {
  test(`a tab ${transfer} during warming does not reopen`, async (t) => {
    const release = delayWarm();
    t.after(release);
    const stop = host.reclaim.registerReclaim();
    t.after(() => stop.dispose());
    const tab = cursorTab();
    tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
    if (transfer === "completed") {
      tab.input = new TabInputCustom(Uri.parse(note), viewType);
    } else if (transfer === "another preview") {
      tab.input = new TabInputCustom(Uri.parse(note), "another.preview");
    } else {
      group.tabs = [];
    }
    release();
    await tick();
    assert.deepEqual(warmed, [note]);
    assert.deepEqual(commands, []);
  });
}

test("selecting another tab during warming does not steal focus back", async (t) => {
  const release = delayWarm();
  t.after(release);
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  const tab = cursorTab();
  const other = cursorTab(`file:///vault/Other-${serial}.md`);
  group.activeTab = tab;
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  assert.deepEqual(warmed, [note]);
  group.activeTab = other;
  release();
  await tick();
  assert.deepEqual(commands, [], "openWith must not override the newer tab");
});

test("selecting another same-URI editor during warming does not reopen", async (t) => {
  const release = delayWarm();
  t.after(release);
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  const tab = cursorTab();
  const sibling: Tab = {
    input: new TabInputCustom(Uri.parse(note), viewType),
    label: tab.label,
    isDirty: false,
    isPreview: false,
    group,
  };
  group.tabs.push(sibling);
  group.activeTab = tab;
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  assert.deepEqual(warmed, [note]);
  group.activeTab = sibling;
  release();
  await tick();
  assert.deepEqual(commands, [], "same-URI custom tab must keep focus");
});

test("same-URI Workbench tab events keep the lease until the last text tab closes", async (t) => {
  const workbench = cursorTab();
  workbench.input = new TabInputCustom(Uri.parse(note), viewType);
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  t.after(() => host.reclaim.handoffLease.release(note));
  host.reclaim.handoffLease.acquire(note);
  const text = cursorTab();
  text.input = new TabInputText(Uri.parse(note));

  // The Workbench tab becomes inactive as the handed-off text tab opens.
  tabsChanged.fire({ opened: [text], changed: [workbench], closed: [] });
  assert.equal(host.reclaim.handoffLease.has(note), true);

  const sibling = cursorTab();
  sibling.input = new TabInputCustom(Uri.parse(note), viewType);
  group.activeTab = text;
  tabsChanged.fire({ opened: [sibling], changed: [], closed: [] });
  assert.equal(host.reclaim.handoffLease.has(note), true);

  group.tabs = group.tabs.filter((tab) => tab !== workbench);
  tabsChanged.fire({ opened: [], changed: [], closed: [workbench] });
  assert.equal(host.reclaim.handoffLease.has(note), true);
  await tick();
  assert.deepEqual(warmed, []);
  assert.deepEqual(commands, [], "reclaim must not interrupt Cursor Edit");

  group.tabs = group.tabs.filter((tab) => tab !== text);
  group.activeTab = sibling;
  tabsChanged.fire({ opened: [], changed: [sibling], closed: [text] });
  assert.equal(host.reclaim.handoffLease.has(note), false);

  sibling.input = undefined;
  tabsChanged.fire({ opened: [], changed: [sibling], closed: [] });
  await tick();
  assert.equal(commands[0]?.[0], "vscode.openWith");
});

test("closing one of two native text tabs keeps the handoff lease", (t) => {
  const first = cursorTab();
  first.input = new TabInputText(Uri.parse(note));
  const last = cursorTab();
  last.input = new TabInputText(Uri.parse(note));
  const otherGroup = { viewColumn: 2, tabs: [last], activeTab: last };
  last.group = otherGroup;
  group.tabs = [first];
  vscode.window.tabGroups.all.push(otherGroup);
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  t.after(() => host.reclaim.handoffLease.release(note));
  host.reclaim.handoffLease.acquire(note);

  group.tabs = [];
  tabsChanged.fire({ opened: [], changed: [], closed: [first] });
  assert.equal(host.reclaim.handoffLease.has(note), true);

  otherGroup.tabs = [];
  tabsChanged.fire({ opened: [], changed: [], closed: [last] });
  assert.equal(host.reclaim.handoffLease.has(note), false);
});

test("switching the last native text tab to Markdown releases the handoff lease", async (t) => {
  const tab = cursorTab();
  tab.input = new TabInputText(Uri.parse(note));
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  t.after(() => host.reclaim.handoffLease.release(note));
  host.reclaim.handoffLease.acquire(note);

  tab.input = undefined;
  tabsChanged.fire({ opened: [], changed: [tab], closed: [] });
  await tick();
  assert.equal(host.reclaim.handoffLease.has(note), false);
  assert.equal(commands[0]?.[0], "vscode.openWith");
});

test("a lease acquired during queued reclaim survives sibling tab changes", async (t) => {
  const release = delayWarm();
  t.after(release);
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  t.after(() => host.reclaim.handoffLease.release(note));
  const text = cursorTab();
  text.input = new TabInputText(Uri.parse(note));
  tabsChanged.fire({ opened: [text], changed: [], closed: [] });
  assert.deepEqual(warmed, [note]);

  host.reclaim.handoffLease.acquire(note);
  const sibling = cursorTab();
  sibling.input = new TabInputCustom(Uri.parse(note), viewType);
  group.activeTab = text;
  tabsChanged.fire({ opened: [sibling], changed: [], closed: [] });
  group.tabs = [text];
  tabsChanged.fire({ opened: [], changed: [], closed: [sibling] });
  release();
  await tick();
  assert.equal(host.reclaim.handoffLease.has(note), true);
  assert.deepEqual(commands, [], "queued openWith must honor the lease");
});

test("failed second same-URI surface handoff keeps the first lease", async (t) => {
  const document: TextEditor["document"] = {
    uri: Uri.parse(note),
    isDirty: true,
    version: 1,
    getText: () => "abcdef",
    positionAt: (offset) => new Position(0, offset),
  };
  documents.push(document);
  const surface = host.cursorHandoff.createCursorHandoffSurface();
  t.after(() => host.reclaim.handoffLease.clear(note));
  const selection = { from: 2, to: 4, text: "cd", version: 1 };
  const first = await handOffSelection(surface, note, selection);
  assert.equal(first.ok, true);
  assert.equal(host.reclaim.handoffLease.has(note), true);

  document.version = 2;
  const second = await handOffSelection(surface, note, selection);
  assert.deepEqual(second, { ok: false, reason: "changed" });
  assert.equal(
    host.reclaim.handoffLease.has(note),
    true,
    "first native Edit lease must survive a failed retry",
  );
});

test("Cursor handoff surface reads live editor state and checks native editor identity", async (t) => {
  const document: TextEditor["document"] = {
    uri: Uri.parse(note),
    isDirty: true,
    version: 1,
    getText: () => "abcdef",
    positionAt: (offset) => new Position(0, offset),
  };
  documents.push(document);
  const surface = host.cursorHandoff.createCursorHandoffSurface();
  t.after(() => surface.releaseLease(note));
  const selection = { from: 2, to: 4, text: "cd", version: 1 };
  const handoff = await handOffSelection(surface, note, selection);
  assert.equal(handoff.ok, true);
  if (!handoff.ok) {
    return;
  }
  const native = vscode.window.activeTextEditor;
  assert.ok(native);
  assert.equal(host.reclaim.handoffLease.has(note), true);
  const opened = await surface.open(note);
  document.version++;
  assert.equal(opened.version, 2, "open must also expose the live version");
  assert.deepEqual(confirmActiveEditor(handoff.editor, note, selection), {
    ok: false,
    reason: "changed",
  });

  document.version = 1;
  const mirrored = native.selection;
  native.selection = new Range(new Position(0, 0), new Position(0, 1));
  assert.deepEqual(confirmActiveEditor(handoff.editor, note, selection), {
    ok: false,
    reason: "inactive",
  });
  native.selection = mirrored;
  assert.equal(confirmActiveEditor(handoff.editor, note, selection).ok, true);

  // Another editor of the same document and range is still a different tab.
  vscode.window.activeTextEditor = { document, selection: mirrored };
  assert.equal(handoff.editor.isActive(), false);
  assert.deepEqual(confirmActiveEditor(handoff.editor, note, selection), {
    ok: false,
    reason: "inactive",
  });
  vscode.window.activeTextEditor = undefined;
  assert.equal(handoff.editor.isActive(), false);
  surface.releaseLease(note);
  assert.equal(host.reclaim.handoffLease.has(note), false);
});

test("ambiguous basenames, known previews and diffs are not reclaimed", async (t) => {
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  const tab = cursorTab();
  documents.push({
    uri: Uri.parse(note.replace("/vault/", "/other/")),
    isDirty: true,
  });
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  tab.input = new TabInputCustom(Uri.parse(note), "another.preview");
  tabsChanged.fire({ opened: [], changed: [tab], closed: [] });
  tab.input = { original: Uri.parse(note), modified: Uri.parse(note) };
  tabsChanged.fire({ opened: [], changed: [tab], closed: [] });
  await tick();
  assert.deepEqual(warmed, []);
  assert.deepEqual(commands, []);
});

for (const gate of ["reclaim disabled", "unassociated", "bypassed"] as const) {
  test(`an input-less Cursor tab stays in place when ${gate}`, async (t) => {
    if (gate === "reclaim disabled") {
      settings.set(`markdownWorkbench.editor.reclaimTextEditor:${note}`, "off");
    } else if (gate === "unassociated") {
      settings.set(`workbench.editorAssociations:${note}`, {
        "*.md": "default",
      });
    } else {
      host.reclaim.textBypass.allow(note);
    }
    const stop = host.reclaim.registerReclaim();
    t.after(() => stop.dispose());
    tabsChanged.fire({ opened: [cursorTab()], changed: [], closed: [] });
    await tick();
    assert.deepEqual(warmed, []);
    assert.deepEqual(commands, []);
  });
}

test("document-open warming reissues an already-open dirty note and deduplicates pending events", async (t) => {
  const release = delayWarm();
  t.after(release);
  const stop = host.warm.registerDocumentWarm();
  t.after(() => stop.dispose());
  const document = { uri: Uri.parse(note), isDirty: true };
  documents.push(document);
  opened.fire(document);
  opened.fire(document);
  assert.deepEqual(warmed, [note]);
  release();
  await tick();
  assert.equal(document.isDirty, true);
  stop.dispose();
  opened.fire(document);
  assert.deepEqual(warmed, [note]);
});

test("activation warms already-open Markdown notes with per-URI settings", async (t) => {
  const disabled = note.replace(".md", ".markdown");
  settings.set(`markdownWorkbench.editor.warmTextDocument:${disabled}`, "off");
  for (const uri of [note, disabled, "file:///vault/a.ts", "git:/vault/a.md"]) {
    documents.push({ uri: Uri.parse(uri), isDirty: true });
  }
  const stop = host.warm.registerDocumentWarm();
  t.after(() => stop.dispose());
  await tick();
  assert.deepEqual(warmed, [note]);
});

test("watcher warming does not recursively warm the document-open event it creates", async (t) => {
  const stop = host.warm.registerDocumentWarm();
  t.after(() => stop.dispose());
  changedFile.fire(Uri.parse(note));
  await tick();
  assert.deepEqual(warmed, [note]);
});

for (const gate of ["off", "non-Cursor auto"] as const) {
  test(`proactive document-open warming respects ${gate}`, async (t) => {
    if (gate === "off") {
      settings.set("markdownWorkbench.editor.warmTextDocument", "off");
    } else {
      vscode.env.appName = "Visual Studio Code";
    }
    const stop = host.warm.registerDocumentWarm();
    t.after(() => stop.dispose());
    opened.fire({ uri: Uri.parse(note), isDirty: true });
    await tick();
    assert.deepEqual(warmed, []);
  });
}

for (const route of [
  "workbench string",
  "workbench URI",
  "public API",
] as const) {
  test(`${route} awaits document warming before openWith`, async (t) => {
    const release = delayWarm();
    t.after(release);
    const uri = Uri.parse(note) as unknown as NativeUri;
    const open =
      route === "public API"
        ? host.api.nativePlatform().open(uri, { preserveFocus: true })
        : host.workbench
            .createWorkbench(uri)
            .execute(
              "vscode.openWith",
              route === "workbench string" ? note : uri,
              viewType,
            );
    assert.deepEqual(warmed, [note]);
    assert.deepEqual(commands, []);
    release();
    await open;
    assert.equal(commands[0]?.[0], "vscode.openWith");
    assert.equal(commands[0]?.[1], note);
    assert.equal(commands[0]?.[2], viewType);
  });
}

test("Open as Text remains bypassed without warming", async () => {
  const workbench = host.workbench.createWorkbench(
    Uri.parse(note) as unknown as NativeUri,
  );
  await workbench.execute("vscode.openWith", note, "default");
  assert.deepEqual(warmed, []);
  assert.equal(host.reclaim.textBypass.has(note), true);
});
