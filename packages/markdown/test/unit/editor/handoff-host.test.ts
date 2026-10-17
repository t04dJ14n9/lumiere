import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import type * as Reclaim from "../../../src/host/reclaim";
import type * as DocumentWarm from "../../../src/host/document-warm";
import type * as HostCommands from "../../../src/host/services/commands";
import type * as NativePlatform from "../../../src/host/api/native-platform";
import type * as CursorHandoff from "../../../src/host/cursor-handoff";
import type * as HostNavigation from "../../../src/host/navigation";
import type { PanelShell, RevealPanel } from "../../../src/shared/host";
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
  viewColumn?: number;
  document: Document & {
    version: number;
    getText(): string;
    positionAt(offset: number): Position;
    offsetAt?(position: Position): number;
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
const selectionChanged = new Emitter<{
  textEditor: TextEditor;
  kind?: number;
}>();
const activeEditorChanged = new Emitter<TextEditor | undefined>();
const warmed: string[] = [];
const commands: unknown[][] = [];
const scopes: { section: string; uri: string | undefined }[] = [];
const settings = new Map<string, unknown>();
let beforeOpen: (() => Promise<void>) | undefined;
let afterCommand: (() => void | Promise<void>) | undefined;
let serial = 0;
let note: string;
const vscode = {
  Uri,
  TabInputText,
  TabInputCustom,
  Position,
  Range,
  TextEditorSelectionChangeKind: { Keyboard: 1, Mouse: 2, Command: 3 },
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
    onDidChangeTextEditorSelection: selectionChanged.event,
    onDidChangeActiveTextEditor: activeEditorChanged.event,
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
      await afterCommand?.();
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
      navigation:
        require("../../../src/host/navigation.ts") as typeof HostNavigation,
      warm: require("../../../src/host/document-warm.ts") as typeof DocumentWarm,
      commands:
        require("../../../src/host/services/commands.ts") as typeof HostCommands,
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
  afterCommand = undefined;
  vscode.env.appName = "Cursor";
  settings.clear();
  settings.set("workbench.editorAssociations", { "*.md": viewType });
  for (const emitter of [
    opened,
    changedFile,
    createdFile,
    createdFiles,
    tabsChanged,
    selectionChanged,
    activeEditorChanged,
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
      (scope) => scope.section === "markdownWorkshop" && scope.uri === note,
    ),
  );

  tab.input = new TabInputCustom(Uri.parse(note), viewType);
  tabsChanged.fire({ opened: [], changed: [tab], closed: [] });
  await tick();
  assert.equal(commands.length, 1, "other → workbench must not loop");
});

test("switching an existing Workshop tab to Cursor Markdown is reclaimed", async (t) => {
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

test("same-URI Workshop tab events keep the lease until the last text tab closes", async (t) => {
  const workbench = cursorTab();
  workbench.input = new TabInputCustom(Uri.parse(note), viewType);
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  const lease = host.reclaim.handoffLease.acquire(note);
  lease.promote();
  t.after(lease.release);
  const text = cursorTab();
  text.input = new TabInputText(Uri.parse(note));

  // The Workshop tab becomes inactive as the handed-off text tab opens.
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
  const lease = host.reclaim.handoffLease.acquire(note);
  lease.promote();
  t.after(lease.release);

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
  const lease = host.reclaim.handoffLease.acquire(note);
  lease.promote();
  t.after(lease.release);

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
  const text = cursorTab();
  text.input = new TabInputText(Uri.parse(note));
  tabsChanged.fire({ opened: [text], changed: [], closed: [] });
  assert.deepEqual(warmed, [note]);

  const lease = host.reclaim.handoffLease.acquire(note);
  t.after(lease.release);
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

test("pending handoff survives the last text tab closing and suppresses queued reclaim", async (t) => {
  const document: TextEditor["document"] = {
    uri: Uri.parse(note),
    isDirty: true,
    version: 1,
    getText: () => "abcdef",
    positionAt: (offset) => new Position(0, offset),
  };
  documents.push(document);
  const stop = host.reclaim.registerReclaim();
  t.after(() => stop.dispose());
  t.after(() => host.reclaim.handoffLease.clear(note));
  const resume = delayWarm();
  t.after(resume);
  const firstText = cursorTab();
  firstText.input = new TabInputText(Uri.parse(note));
  // Reclaim was queued before Edit A established its native session.
  tabsChanged.fire({ opened: [firstText], changed: [], closed: [] });
  assert.deepEqual(warmed, [note]);
  host.reclaim.handoffLease.acquire(note).promote();

  const surface = host.cursorHandoff.createCursorHandoffSurface();
  const pending = handOffSelection(surface, note, {
    from: 2,
    to: 4,
    text: "cd",
    version: 1,
  });
  assert.deepEqual(warmed, [note, note], "Edit B is paused in warm");
  group.tabs = [];
  group.activeTab = undefined;
  tabsChanged.fire({ opened: [], changed: [], closed: [firstText] });
  assert.equal(host.reclaim.handoffLease.has(note), true);

  // The native tab reappears before either warm operation has resumed.
  const nextText = cursorTab();
  nextText.input = new TabInputText(Uri.parse(note));
  tabsChanged.fire({ opened: [nextText], changed: [], closed: [] });
  assert.deepEqual(
    warmed,
    [note, note],
    "B's pending token blocks new reclaim",
  );
  resume();
  const result = await pending;
  assert.equal(result.ok, true);
  await tick();
  assert.equal(host.reclaim.handoffLease.has(note), true);
  assert.deepEqual(commands, [], "queued openWith must not interrupt Edit B");

  group.tabs = [];
  group.activeTab = undefined;
  tabsChanged.fire({ opened: [], changed: [], closed: [nextText] });
  assert.equal(host.reclaim.handoffLease.has(note), false, "B was promoted");
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
  t.after(() => host.reclaim.handoffLease.clear(note));
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
  handoff.lease.release();
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
      settings.set(`markdownWorkshop.editor.reclaimTextEditor:${note}`, "off");
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
  settings.set(`markdownWorkshop.editor.warmTextDocument:${disabled}`, "off");
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
      settings.set("markdownWorkshop.editor.warmTextDocument", "off");
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
        ? host.api
            .nativePlatform("test.workshop")
            .open(uri, { preserveFocus: true })
        : host.commands
            .createHostCommands()
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
  await host.commands
    .createHostCommands()
    .execute("vscode.openWith", note, "default");
  assert.deepEqual(warmed, []);
  assert.equal(host.reclaim.textBypass.has(note), true);
});

function nativeHunkEditor(tab: Tab, line = 929, eol = "\n"): TextEditor {
  const lines = Array.from({ length: 1000 }, (_, index) => `Line ${index + 1}`);
  const editor = {
    viewColumn: tab.group.viewColumn,
    document: {
      uri: Uri.parse(note),
      isDirty: true,
      version: 1,
      getText: () => lines.join(eol),
      positionAt: (offset: number) => new Position(0, offset),
      offsetAt: (position: Position) =>
        lines
          .slice(0, position.line)
          .reduce((length, value) => length + value.length + eol.length, 0) +
        position.character,
    },
    selection: new Range(new Position(line, 0), new Position(line + 2, 4)),
  };
  tab.input = new TabInputText(Uri.parse(note));
  vscode.window.activeTextEditor = editor;
  return editor;
}

function hunkDestination(tab: Tab, reused = false) {
  const calls: number[] = [];
  const shell = {
    id: "destination",
    column: 1,
    document: { uri: note },
    active: () => tab.input instanceof TabInputCustom,
  } as PanelShell;
  const sibling = { ...shell, id: "sibling", column: 2, active: () => false };
  const panels = reused ? [sibling, shell] : [sibling];
  const navigation = host.navigation.createNavigation(() => panels);
  const reveal = {
    id: shell.id,
    uri: note,
    active: shell.active,
    async reveal(target, token) {
      if (!token.cancelled) {
        calls.push(target.at!);
      }
      return !token.cancelled;
    },
  } satisfies RevealPanel;
  navigation.registerReveal({
    ...reveal,
    id: sibling.id,
    reveal: async () => {
      assert.fail("same-URI sibling received the reveal");
    },
  });
  afterCommand = () => {
    tab.input = new TabInputCustom(Uri.parse(note), viewType);
    vscode.window.activeTextEditor = undefined;
    if (!panels.includes(shell)) {
      panels.push(shell);
    }
  };
  return { navigation, calls, ready: () => navigation.registerReveal(reveal) };
}

for (const reused of [false, true]) {
  test(`hunk open transfers the selection start into the ${reused ? "existing" : "new"} exact panel`, async (t) => {
    const tab = cursorTab();
    const destination = hunkDestination(tab, reused);
    const stop = host.reclaim.registerReclaim(destination.navigation);
    const editor = nativeHunkEditor(tab);
    t.after(() => stop.dispose());
    destination.ready();
    tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
    await tick();
    assert.deepEqual(destination.calls, [
      editor.document.getText().indexOf("Line 930\n"),
    ]);
    assert.equal(commands.length, 1);
    assert.ok(group.tabs.includes(tab), "dirty native document survives");
  });
}

test("a cold hunk open waits for reveal registration and leaves no replay for recreation", async (t) => {
  const tab = cursorTab();
  const destination = hunkDestination(tab);
  const stop = host.reclaim.registerReclaim(destination.navigation);
  const editor = nativeHunkEditor(tab, 947, "\r\n");
  t.after(() => stop.dispose());
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  await tick();
  assert.equal(commands.length, 1);
  assert.deepEqual(destination.calls, []);
  const unregister = destination.ready();
  await tick();
  assert.deepEqual(destination.calls, [
    editor.document.getText().replaceAll("\r\n", "\n").indexOf("Line 948\n"),
  ]);
  unregister();
  destination.ready();
  await tick();
  assert.equal(destination.calls.length, 1);
});

test("a hunk selection exposed by late native activation survives an in-flight openWith", async (t) => {
  let finishOpen = () => {};
  const opening = new Promise<void>((resolve) => {
    finishOpen = resolve;
  });
  t.after(finishOpen);
  const tab = cursorTab();
  const destination = hunkDestination(tab);
  const completeOpen = afterCommand;
  afterCommand = async () => {
    await opening;
    await completeOpen?.();
  };
  const stop = host.reclaim.registerReclaim(destination.navigation);
  t.after(() => stop.dispose());
  tab.input = new TabInputText(Uri.parse(note));
  destination.ready();
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  await tick();
  assert.equal(commands.length, 1);
  const editor = nativeHunkEditor(tab, 947);
  activeEditorChanged.fire(editor);
  finishOpen();
  await tick();
  assert.deepEqual(destination.calls, [
    editor.document.getText().indexOf("Line 948\n"),
  ]);
  assert.equal(commands.length, 1);
});

test("hunk transfer leaves another clean native tab of the same note open", async (t) => {
  const tab = cursorTab();
  const destination = hunkDestination(tab, true);
  const stop = host.reclaim.registerReclaim(destination.navigation);
  t.after(() => stop.dispose());
  nativeHunkEditor(tab);
  const sibling: Tab = { ...tab, isDirty: false };
  group.tabs.push(sibling);
  destination.ready();
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  await tick();
  assert.equal(destination.calls.length, 1);
  assert.ok(
    group.tabs.includes(sibling),
    "only the transferred native tab may close",
  );
});

test("command selection on a reused native tab reveals without a tab event, including repeated hunks", async (t) => {
  const tab = cursorTab();
  const editor = nativeHunkEditor(tab);
  const destination = hunkDestination(tab, true);
  const stop = host.reclaim.registerReclaim(destination.navigation);
  t.after(() => stop.dispose());
  destination.ready();
  selectionChanged.fire({ textEditor: editor, kind: 3 });
  await tick();
  const next = nativeHunkEditor(tab, 947);
  selectionChanged.fire({ textEditor: next, kind: 3 });
  await tick();
  assert.deepEqual(destination.calls, [
    editor.document.getText().indexOf("Line 930\n"),
    next.document.getText().indexOf("Line 948\n"),
  ]);
  assert.equal(commands.length, 2);
});

test("a second hunk during reveal readiness supersedes the in-flight offset", async (t) => {
  const tab = cursorTab();
  const destination = hunkDestination(tab);
  const stop = host.reclaim.registerReclaim(destination.navigation);
  const first = nativeHunkEditor(tab);
  t.after(() => stop.dispose());
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  await tick();
  assert.equal(commands.length, 1, "first transfer awaits reveal registration");
  assert.equal(destination.calls.length, 0);
  const next = nativeHunkEditor(tab, 947);
  selectionChanged.fire({ textEditor: next, kind: 3 });
  destination.ready();
  await tick();
  assert.deepEqual(destination.calls, [
    next.document.getText().indexOf("Line 948\n"),
  ]);
  assert.equal(
    destination.calls.includes(first.document.getText().indexOf("Line 930\n")),
    false,
    "superseded first offset must not apply",
  );
  assert.equal(commands.length, 2);
});

for (const optOut of ["Open as Text", "Cursor Edit lease"] as const) {
  test(`${optOut} during reveal readiness keeps the clean native tab open`, async (t) => {
    const tab = cursorTab();
    tab.isDirty = false;
    documents.find((document) => document.uri.toString() === note)!.isDirty =
      false;
    let releaseReveal = () => {};
    const held = new Promise<void>((resolve) => {
      releaseReveal = resolve;
    });
    t.after(releaseReveal);
    const shell = {
      id: "destination",
      column: 1,
      document: { uri: note },
      active: () => true,
    } as PanelShell;
    const panels = [shell];
    const navigation = host.navigation.createNavigation(() => panels);
    const stop = host.reclaim.registerReclaim(navigation);
    t.after(() => stop.dispose());
    nativeHunkEditor(tab);
    tab.isDirty = false;
    navigation.registerReveal({
      id: shell.id,
      uri: note,
      active: () => true,
      async reveal(_target, token) {
        await held;
        return !token.cancelled;
      },
    });
    afterCommand = () => {
      tab.input = new TabInputCustom(Uri.parse(note), viewType);
      vscode.window.activeTextEditor = undefined;
    };
    tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
    await tick();
    assert.equal(commands.length, 1);
    if (optOut === "Open as Text") {
      host.reclaim.textBypass.allow(note);
    } else {
      const lease = host.reclaim.handoffLease.acquire(note);
      lease.promote();
      t.after(lease.release);
    }
    // Keep the native text tab present for cleanup to consider closing.
    tab.input = new TabInputText(Uri.parse(note));
    releaseReveal();
    await tick();
    assert.ok(
      group.tabs.includes(tab),
      "clean native tab must survive an opt-out during reveal wait",
    );
  });
}

test("Open as Text keeps the native tab even after textBypass TTL expires during reveal wait", async (t) => {
  const tab = cursorTab();
  tab.isDirty = false;
  documents.find((document) => document.uri.toString() === note)!.isDirty =
    false;
  let releaseReveal = () => {};
  const held = new Promise<void>((resolve) => {
    releaseReveal = resolve;
  });
  t.after(releaseReveal);
  const shell = {
    id: "destination",
    column: 1,
    document: { uri: note },
    active: () => true,
  } as PanelShell;
  const panels = [shell];
  const navigation = host.navigation.createNavigation(() => panels);
  const stop = host.reclaim.registerReclaim(navigation);
  t.after(() => stop.dispose());
  nativeHunkEditor(tab);
  tab.isDirty = false;
  navigation.registerReveal({
    id: shell.id,
    uri: note,
    active: () => true,
    async reveal(_target, token) {
      await held;
      return !token.cancelled;
    },
  });
  afterCommand = () => {
    tab.input = new TabInputCustom(Uri.parse(note), viewType);
    vscode.window.activeTextEditor = undefined;
  };
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  await tick();
  assert.equal(commands.length, 1);
  host.reclaim.textBypass.allow(note);
  // Let the reveal-wait watcher observe the opt-out before the TTL expires.
  await new Promise<void>((resolve) => setTimeout(resolve, 40));
  assert.equal(host.reclaim.textBypass.has(note), true);
  (
    host.reclaim.textBypass as unknown as { until: Map<string, number> }
  ).until.set(note, Date.now() - 1);
  assert.equal(host.reclaim.textBypass.has(note), false);
  tab.input = new TabInputText(Uri.parse(note));
  releaseReveal();
  await tick();
  assert.ok(
    group.tabs.includes(tab),
    "sticky keepNative must outlive textBypass TTL",
  );
});

test("a selection arriving during warming replaces the initial position without reopening twice", async (t) => {
  const release = delayWarm();
  t.after(release);
  const tab = cursorTab();
  const destination = hunkDestination(tab);
  const stop = host.reclaim.registerReclaim(destination.navigation);
  nativeHunkEditor(tab, 0);
  t.after(() => stop.dispose());
  destination.ready();
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  const editor = nativeHunkEditor(tab, 947);
  selectionChanged.fire({ textEditor: editor, kind: 3 });
  release();
  await tick();
  assert.equal(commands.length, 1);
  assert.deepEqual(destination.calls, [
    editor.document.getText().indexOf("Line 948\n"),
  ]);
});

test("a reused preview tab can target another note while the first hunk is warming", async (t) => {
  const release = delayWarm();
  t.after(release);
  const navigation = host.navigation.createNavigation(() => []);
  const stop = host.reclaim.registerReclaim(navigation);
  t.after(() => stop.dispose());
  const tab = cursorTab();
  nativeHunkEditor(tab);
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  note = `file:///vault/Next-${serial}.md`;
  tab.label = `Next-${serial}.md`;
  const next = nativeHunkEditor(tab, 947);
  selectionChanged.fire({ textEditor: next, kind: 3 });
  release();
  await tick();
  assert.deepEqual(
    commands.map((command) => command[1]),
    [note],
  );
});

test("background tab notifications do not cancel the active panel's navigation", async (t) => {
  const tab = cursorTab();
  const destination = hunkDestination(tab);
  const stop = host.reclaim.registerReclaim(destination.navigation);
  t.after(() => stop.dispose());
  nativeHunkEditor(tab);
  const active = destination.navigation.begin();
  cursorTab(`file:///vault/Other-${serial}.md`);
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  await tick();
  assert.equal(active.token.cancelled, false);
  assert.deepEqual(commands, []);
});

test("Open as Text during warming cancels the queued hunk transfer", async (t) => {
  const release = delayWarm();
  t.after(release);
  const tab = cursorTab();
  const destination = hunkDestination(tab);
  const stop = host.reclaim.registerReclaim(destination.navigation);
  t.after(() => stop.dispose());
  nativeHunkEditor(tab);
  destination.ready();
  tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
  assert.deepEqual(warmed, [note]);
  host.reclaim.textBypass.allow(note);
  release();
  await tick();
  assert.deepEqual(commands, []);
  assert.deepEqual(destination.calls, []);
});

for (const cancelledBy of ["newer navigation", "disposal"] as const) {
  test(`${cancelledBy} cancels a hunk open still warming its native document`, async (t) => {
    const release = delayWarm();
    t.after(release);
    const tab = cursorTab();
    const destination = hunkDestination(tab);
    const stop = host.reclaim.registerReclaim(destination.navigation);
    t.after(() => stop.dispose());
    nativeHunkEditor(tab);
    tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
    assert.deepEqual(warmed, [note]);
    if (cancelledBy === "disposal") {
      stop.dispose();
    } else {
      destination.navigation.begin();
    }
    release();
    await tick();
    assert.deepEqual(commands, []);
    assert.deepEqual(destination.calls, []);
  });

  test(`${cancelledBy} cancels a hunk reveal pending panel readiness`, async (t) => {
    const tab = cursorTab();
    const destination = hunkDestination(tab);
    const stop = host.reclaim.registerReclaim(destination.navigation);
    nativeHunkEditor(tab);
    t.after(() => stop.dispose());
    tabsChanged.fire({ opened: [tab], changed: [], closed: [] });
    await tick();
    assert.equal(
      commands.length,
      1,
      "the reveal is waiting after the native open",
    );
    if (cancelledBy === "disposal") {
      stop.dispose();
    } else {
      destination.navigation.begin();
    }
    destination.ready();
    await tick();
    assert.deepEqual(destination.calls, []);
  });
}

for (const ignored of [
  "keyboard",
  "mouse",
  "background editor",
  "other group",
  "bypass",
  "lease",
  "diff",
  "disabled",
  "unassociated",
] as const) {
  test(`native hunk selection bridge ignores ${ignored}`, async (t) => {
    const tab = cursorTab();
    const editor = nativeHunkEditor(tab);
    const destination = hunkDestination(tab);
    const stop = host.reclaim.registerReclaim(destination.navigation);
    t.after(() => stop.dispose());
    let kind = 3;
    if (ignored === "keyboard") {
      kind = 1;
    }
    if (ignored === "mouse") {
      kind = 2;
    }
    if (ignored === "background editor") {
      vscode.window.activeTextEditor = { ...editor };
    }
    if (ignored === "other group") {
      editor.viewColumn = 2;
    }
    if (ignored === "bypass") {
      host.reclaim.textBypass.allow(note);
    }
    if (ignored === "lease") {
      const lease = host.reclaim.handoffLease.acquire(note);
      t.after(lease.release);
    }
    if (ignored === "diff") {
      tab.input = { original: Uri.parse(note), modified: Uri.parse(note) };
    }
    if (ignored === "disabled") {
      settings.set("markdownWorkshop.editor.reclaimTextEditor", "off");
    }
    if (ignored === "unassociated") {
      settings.set("workbench.editorAssociations", {});
    }
    selectionChanged.fire({ textEditor: editor, kind });
    await tick();
    assert.deepEqual(commands, []);
    assert.deepEqual(destination.calls, []);
  });
}
