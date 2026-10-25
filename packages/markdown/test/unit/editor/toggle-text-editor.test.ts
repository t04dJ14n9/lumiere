import assert from "node:assert/strict";
import test from "node:test";
import { createRoot } from "@workshop/core";
import {
  registerToggleTextEditor,
  toggleTextEditor,
} from "../../../src/plugins/editor/toggle-text-editor";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import { editorHost } from "../../../src/plugins/editor/host";
import { MARKDOWN_EDITOR } from "../../../src/shared/editor-provider";
import { provideHostServices } from "../../../src/shared/host";
import type { DocumentSession } from "../../../src/plugins/document/api";
import { fakeDocument, fakeHost } from "../../support/vscode-fake";

function panelHarness(uri = "file:///note.md") {
  const calls: unknown[][] = [];
  const closed: [string, "text" | "lumiere"][] = [];
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
    activeEditor: {
      closeSiblingTabs: async (target, keep) => {
        closed.push([target, keep]);
      },
    },
  });
  return {
    calls,
    closed,
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
  assert.deepEqual(h.closed, [["file:///a.md", "text"]]);
});

test("from Lumière, losing focus before openWith fails like Open as Text", async () => {
  const h = panelHarness();
  h.blur();
  await assert.rejects(
    () => toggleTextEditor(h.host),
    /lost focus before the command completed/,
  );
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.closed, []);
});

test("from the built-in text editor, Ctrl/Cmd+E opens Lumière for that URI", async () => {
  const calls: unknown[][] = [];
  const closed: [string, "text" | "lumiere"][] = [];
  const host = fakeHost({
    activeEditor: {
      note: () => "file:///b.md",
      textEditor: () => ({ text: "hi", selection: "" }),
      onNoteChanged: () => () => {},
      onTextSelectionChanged: () => () => {},
      closeSiblingTabs: async (uri, keep) => {
        closed.push([uri, keep]);
      },
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
  assert.deepEqual(closed, [["file:///b.md", "lumiere"]]);
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

test("the editor host's Ctrl/Cmd+E command can read the editors service it provides", async () => {
  let toggle: (() => Promise<void>) | undefined;
  const calls: unknown[][] = [];
  const root = createRoot();
  root.provide("documents", {
    session: () => ({}) as DocumentSession,
    release() {},
  });
  provideHostServices(
    root,
    fakeHost({
      activeEditor: {
        note: () => "file:///note.md",
        textEditor: () => ({ text: "hi", selection: "" }),
        onNoteChanged: () => () => {},
        onTextSelectionChanged: () => () => {},
      },
      hostCommands: {
        register: (id, command) => {
          if (id === "lumiere.markdown.toggleTextEditor") {
            toggle = async () => {
              await command();
            };
          }
          return () => {};
        },
        execute: async (...args) => {
          calls.push(args);
          return undefined;
        },
      },
    }),
  );
  root.plugin(editorHost, { configure() {} });
  await root.settled();

  assert.ok(toggle, "editor host should register the toggle command");
  await toggle();

  assert.deepEqual(calls.at(-1), [
    "vscode.openWith",
    "file:///note.md",
    MARKDOWN_EDITOR.viewType,
  ]);
  await root.dispose();
});

test("toggleTextEditor with unbound Context.serial fails like Host GUI", async () => {
  const root = createRoot();
  const h = panelHarness("file:///unbound.md");
  // Same extraction the broken register used: serial: ctx.serial
  await assert.rejects(
    () =>
      toggleTextEditor({
        ...h.host,
        serial: root.serial,
      }),
    (err: unknown) => {
      assert.ok(err instanceof TypeError);
      assert.match(String(err), /assertLive is not a function/);
      return true;
    },
  );
  assert.deepEqual(h.calls, []);
  await root.dispose();
});

test("registerToggleTextEditor keeps serial bound through the Lumière panel path", async () => {
  let toggle: (() => Promise<void>) | undefined;
  const calls: unknown[][] = [];
  const root = createRoot();
  const document = fakeDocument({
    uri: "file:///bound.md",
    id: "file:///bound.md",
  });
  const panel = {
    id: "panel",
    document,
    active: () => true,
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
  const closed: [string, "text" | "lumiere"][] = [];
  provideHostServices(
    root,
    fakeHost({
      hostCommands: {
        register: (id, command) => {
          if (id === "lumiere.markdown.toggleTextEditor") {
            toggle = async () => {
              await command();
            };
          }
          return () => {};
        },
        execute: async (...args) => {
          calls.push(args);
          return undefined;
        },
      },
      activeEditor: {
        closeSiblingTabs: async (uri, keep) => {
          closed.push([uri, keep]);
        },
      },
    }),
  );
  root.plugin({
    name: "testToggleBind",
    inject: { required: ["hostCommands", "activeEditor"] },
    apply(ctx) {
      registerToggleTextEditor(ctx, editors);
    },
  });
  await root.settled();

  assert.ok(toggle, "toggle command should register");
  await toggle();

  assert.deepEqual(calls, [["vscode.openWith", "file:///bound.md", "default"]]);
  assert.deepEqual(closed, [["file:///bound.md", "text"]]);
  await root.dispose();
});
