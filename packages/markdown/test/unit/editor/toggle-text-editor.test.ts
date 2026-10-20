import assert from "node:assert/strict";
import test from "node:test";
import { toggleTextEditor } from "../../../src/plugins/editor/toggle-text-editor";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";
import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";

function panelHarness(uri = "file:///note.md") {
  const calls: unknown[][] = [];
  let focused = true;
  const document = fakeDocument({ uri, id: uri });
  const panel = {
    id: "panel",
    document,
    active: () => focused,
    session: {
      withAction: async <T>(run: () => Promise<T>) => run(),
      flush: async () => {},
    },
  } as unknown as EditorPanel;
  const editors: Editors = {
    all: () => [panel],
    active: () => panel,
    capture: async () => {
      throw new Error("unused");
    },
    restore: async () => {},
  };
  const host = fakeHost({
    hostCommands: {
      register: () => () => {},
      execute: async (...args) => {
        calls.push(args);
        return undefined;
      },
    },
  });
  return {
    calls,
    panel,
    blur: () => {
      focused = false;
    },
    host: {
      editors,
      activeEditor: host.activeEditor,
      hostCommands: host.hostCommands,
      serial: async () => {},
    },
  };
}

test("from Lumière, Ctrl/Cmd+E opens the same URI with the default text editor", async () => {
  const h = panelHarness("file:///a.md");
  await toggleTextEditor(h.host);
  assert.deepEqual(h.calls, [["vscode.openWith", "file:///a.md", "default"]]);
});

test("from Lumière, losing focus before openWith fails like Open as Text", async () => {
  const h = panelHarness();
  h.blur();
  await assert.rejects(
    () => toggleTextEditor(h.host),
    /lost focus before the command completed/,
  );
  assert.deepEqual(h.calls, []);
});

test("from the built-in text editor, Ctrl/Cmd+E opens Lumière for that URI", async () => {
  const calls: unknown[][] = [];
  const host = fakeHost({
    activeEditor: {
      note: () => "file:///b.md",
      textEditor: () => ({ text: "hi", selection: "" }),
      onNoteChanged: () => () => {},
      onTextSelectionChanged: () => () => {},
    },
    hostCommands: {
      register: () => () => {},
      execute: async (...args) => {
        calls.push(args);
        return undefined;
      },
    },
  });
  await toggleTextEditor({
    editors: {
      all: () => [],
      active: () => undefined,
      capture: async () => {
        throw new Error("unused");
      },
      restore: async () => {},
    },
    activeEditor: host.activeEditor,
    hostCommands: host.hostCommands,
    serial: async () => {},
  });
  assert.deepEqual(calls, [
    ["vscode.openWith", "file:///b.md", MARKDOWN_EDITOR.viewType],
  ]);
});

test("with no Lumière panel and no text editor for the note, the toggle is a no-op", async () => {
  const calls: unknown[][] = [];
  const host = fakeHost({
    activeEditor: {
      note: () => "file:///c.md",
      textEditor: () => undefined,
      onNoteChanged: () => () => {},
      onTextSelectionChanged: () => () => {},
    },
    hostCommands: {
      register: () => () => {},
      execute: async (...args) => {
        calls.push(args);
        return undefined;
      },
    },
  });
  await toggleTextEditor({
    editors: {
      all: () => [],
      active: () => undefined,
      capture: async () => {
        throw new Error("unused");
      },
      restore: async () => {},
    },
    activeEditor: host.activeEditor,
    hostCommands: host.hostCommands,
    serial: async () => {},
  });
  assert.deepEqual(calls, []);
});

test("with nothing open, the toggle is a no-op", async () => {
  const calls: unknown[][] = [];
  const host = fakeHost({
    hostCommands: {
      register: () => () => {},
      execute: async (...args) => {
        calls.push(args);
        return undefined;
      },
    },
  });
  await toggleTextEditor({
    editors: {
      all: () => [],
      active: () => undefined,
      capture: async () => {
        throw new Error("unused");
      },
      restore: async () => {},
    },
    activeEditor: host.activeEditor,
    hostCommands: host.hostCommands,
    serial: async () => {},
  });
  assert.deepEqual(calls, []);
});
