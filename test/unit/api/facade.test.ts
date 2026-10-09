import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fixture, uri } from "./fixture";
import { targetRange } from "../../../src/host/api/editors";
import { SourceCoordinates } from "../../../src/shared/document/coordinates";
import type { SelectionSnapshot } from "../../../src/host/api/types";

test("frozen facade keeps two panels of one document distinct and targets native source coordinates", async () => {
  const f = await fixture();
  assert.equal(Object.isFrozen(f.api), true);
  assert.equal(f.api.apiVersion, 1);
  const editors = f.api.getEditors();
  assert.equal(Object.isFrozen(editors), true);
  assert.deepEqual(
    editors.map((editor) => editor.editorId),
    ["panel", "second"],
  );
  assert.equal(editors[0]?.documentId, editors[1]?.documentId);
  assert.equal(f.api.getActiveEditor()?.editorId, "panel");
  assert.equal(
    (
      await f.api.open(uri(f.panel.document.uri), {
        viewColumn: 2,
        reveal: { from: 5, to: 8 },
      })
    ).editorId,
    "second",
  );
  assert.deepEqual(f.reveals.pop(), { from: 4, to: 7, focus: true });
  await f.api.reveal("panel", { line: 2 }, { focus: false });
  assert.deepEqual(f.reveals.pop(), { from: 4, to: 4, focus: false });
  assert.deepEqual(
    targetRange(new SourceCoordinates("# Heading\r\nbody"), {
      fragment: "Heading",
    }),
    { from: 0, to: 0 },
  );
  await assert.rejects(f.api.reveal("missing", { line: 1 }), {
    code: "EditorNotFound",
  });
  await assert.rejects(f.api.reveal("panel", { from: -1, to: 2 }), {
    code: "InvalidArgument",
  });
  await assert.rejects(f.api.reveal("panel", { line: 0 }), {
    code: "InvalidArgument",
  });
  await f.dispose();
});

test("API selection identity rejects clones, stale source and dirty agent copies", async () => {
  const f = await fixture();
  const selection = await f.api.getSelection("second");
  assert.ok(selection);
  assert.equal(Object.isFrozen(selection), true);
  assert.deepEqual(
    [selection.from, selection.to, selection.startLine, selection.endLine],
    [5, 8, 2, 2],
  );
  const reference = await f.api.createAgentReference(selection);
  assert.equal(reference.text, "@Note.md#2");
  assert.equal(reference.uri.toString(), f.panel.document.uri);
  // Only the host-held object is a selection; a copy is not one.
  await assert.rejects(f.api.createAgentReference({ ...selection }), {
    code: "InvalidArgument",
  });
  await f.api.copyForAgent("panel");
  assert.equal(f.copied.pop(), "@Note.md#1-2");
  f.state.dirty = true;
  await assert.rejects(f.api.copyForAgent("panel"), { code: "DocumentDirty" });
  f.state.version++;
  await assert.rejects(f.api.createAgentReference(selection), {
    code: "StaleSelection",
  });
  await assert.rejects(f.api.getSelection("missing"), {
    code: "EditorNotFound",
  });
  await f.dispose();
});

test("API vault snapshots cannot mutate arrays, nested metadata or footnote maps", async () => {
  const f = await fixture();
  assert.equal(
    f.api.resolveLink("Note", uri("file:///vault/Other.md"))?.toString(),
    f.panel.document.uri,
  );
  assert.equal(
    f.api.resolveLink("missing", uri(f.panel.document.uri)),
    undefined,
  );
  assert.deepEqual(f.api.getBacklinks(uri(f.panel.document.uri)), [
    { path: "Other.md", count: 1 },
  ]);
  const note = f.api.getMetadata(uri(f.panel.document.uri));
  assert.ok(note);
  assert.equal(Object.isFrozen(note.headings), true);
  assert.throws(() =>
    (note as unknown as { aliases: string[] }).aliases.push("injected"),
  );
  assert.equal("set" in note.footnotes.references, false);
  assert.ok(note.footnotes.references.size > 0);
  assert.equal(f.index.metadata("Note.md")?.aliases.length, 0);
  assert.equal(f.api.getMetadata(uri("file:///outside.md")), undefined);
  await f.dispose();
});

test("all public event channels isolate listeners, preserve panel identity and unsubscribe", async () => {
  const f = await fixture();
  const events: string[] = [];
  const stop = f.api.onDidOpenEditor((editor) =>
    events.push(`open:${editor.editorId}`),
  );
  f.api.onDidOpenEditor(() => {
    throw new Error("consumer error");
  });
  f.api.onDidCloseEditor((event) => events.push(`close:${event.editorId}`));
  f.api.onDidChangeActiveEditor((editor) =>
    events.push(`active:${editor?.editorId}`),
  );
  f.api.onDidChangeDocument((doc) => events.push(`document:${doc.version}`));
  f.api.onDidChangeSelection((event) =>
    events.push(`selection:${event.editorId}:${event.hasSelection}`),
  );
  f.api.onDidChangePlugins((event) => events.push(`plugins:${event.editorId}`));
  f.api.onDidResolveLinks((event) => events.push(`vault:${event.vault}`));
  f.root.emit("editor/opened", f.panel);
  f.root.emit("editor/activeChanged", f.panels[1]);
  // A text document no Markdown Workbench editor shows is not reported.
  f.emitDocument({ ...f.panel.document, id: "settings.json" });
  f.emitDocument();
  f.root.emit("editor/selectionChanged", f.panel, true);
  f.root.emit("editor/pluginsChanged", f.panel);
  f.root.emit("vault/resolved", "file:///vault");
  f.root.emit("editor/closed", f.panel);
  stop.dispose();
  f.root.emit("editor/opened", f.panel);
  assert.deepEqual(events.slice(0, 8), [
    "open:panel",
    "active:second",
    "document:1",
    "selection:panel:true",
    "plugins:panel",
    "plugins:second",
    "vault:file:///vault",
    "close:panel",
  ]);
  assert.equal(events.filter((item) => item === "open:panel").length, 1);
  await f.dispose();
});

test("catalog, actual pending states, feature writes, reset and settings entry point", async () => {
  const f = await fixture();
  const catalog = f.api.getPluginCatalog();
  assert.equal(Object.isFrozen(catalog), true);
  assert.ok(catalog.some((item) => item.id === "tables"));
  assert.equal(
    f.api.getPlugins("panel").find((item) => item.id === "tables")?.state,
    "pending",
  );
  const changed = await f.api.setPluginEnabled("tables", false, {
    target: "workspace",
  });
  assert.equal(changed.editors.length, 2);
  assert.equal(
    f.api.getPlugins("panel").find((item) => item.id === "tables")?.state,
    "disabled",
  );
  await f.api.resetPluginOverride("tables", { target: "workspace" });
  assert.equal(
    f.api.getPlugins("panel").find((item) => item.id === "tables")?.enabled,
    true,
  );
  await assert.rejects(
    f.api.setPluginEnabled("editor", false, { target: "global" }),
    { code: "InvalidArgument" },
  );
  await assert.rejects(
    f.api.resetPluginOverride("unknown", { target: "global" }),
    { code: "InvalidArgument" },
  );
  assert.throws(() => f.api.getPlugins("missing"), { code: "EditorNotFound" });
  await f.api.openPluginSettings(uri(f.panel.document.uri));
  assert.equal(f.settings.length, 1);
  await f.dispose();
});

test("cancelled API selection never yields a reference", async () => {
  const f = await fixture();
  await assert.rejects(
    f.api.getSelection("panel", {
      token: {
        isCancellationRequested: true,
        onCancellationRequested: () => ({ dispose() {} }),
      },
    }),
    { code: "Cancelled" },
  );
  await assert.rejects(f.api.createAgentReference({} as SelectionSnapshot), {
    code: "InvalidArgument",
  });
  await f.dispose();
});

// dist/api is generated from these files; consumers must not need internals.
test("public declarations import only vscode and each other", () => {
  for (const file of ["types", "plugin-types", "metadata-types"]) {
    const source = readFileSync(`src/host/api/${file}.ts`, "utf8");
    for (const [, specifier] of source.matchAll(/from "([^"]+)"/g)) {
      assert.ok(
        specifier === "vscode" ||
          ["./types", "./plugin-types", "./metadata-types"].includes(
            specifier!,
          ),
        `${file}.ts imports ${specifier}`,
      );
    }
  }
});
