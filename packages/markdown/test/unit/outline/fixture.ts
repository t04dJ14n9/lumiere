import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import { outlineHost } from "../../../src/plugins/outline/host";
import {
  COMMANDS_CONTEXT,
  FOLLOW_CURSOR_CONTEXT,
  FOLLOW_CURSOR_SETTING,
  VIEW_ID,
} from "../../../src/plugins/outline/commands";
import type { TreeHandle, TreeNode } from "../../../src/shared/runtime";
import { fakeDocument } from "../../support/vscode-fake";
import { fakeViews, memoryVaults, uriOf, workbenchWith } from "../views/fakes";

export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function outlineFixture(
  notes: Record<string, string> = {
    "A.md": "# Title\nintro\n## Part\nbody\n",
  },
) {
  const fake = fakeViews();
  const { vaults, texts, opened } = memoryVaults(notes);
  const reveals: {
    node: TreeNode;
    options: Parameters<TreeHandle["reveal"]>[1];
  }[] = [];
  const warnings: unknown[] = [];
  const settingsWrites: unknown[][] = [];
  const resources = new Map<string, boolean>();
  const contexts = new Map<string, unknown>();
  const executed: unknown[][] = [];
  const panels: EditorPanel[] = [];
  let active: EditorPanel | undefined;
  let visible = true;
  let configure = () => {};
  let visibilityChanged = (_visible: boolean) => {};
  let treeOptions: Parameters<typeof fake.views.tree>[2];
  const originalTree = fake.views.tree;
  fake.views.tree = (id, source, options) => {
    treeOptions = options;
    return {
      ...originalTree(id, source, options),
      async reveal(node, options) {
        reveals.push({ node, options });
      },
      get visible() {
        return visible;
      },
      onVisibilityChanged(listener) {
        visibilityChanged = listener;
        return () => {
          visibilityChanged = () => {};
        };
      },
    };
  };
  const workshop = workbenchWith(fake.views);
  workshop.command = (id, run) => fake.views.command(id, run);
  workshop.execute = async (command, key, value) => {
    executed.push([command, key, value].filter((part) => part !== undefined));
    if (command === "setContext") {
      contexts.set(String(key), value);
    }
  };
  workshop.onConfiguration = (listener) => {
    configure = listener;
    return () => {
      configure = () => {};
    };
  };
  workshop.settings = {
    inspect(key, resource) {
      assert.equal(key, FOLLOW_CURSOR_SETTING);
      return {
        value:
          (resource && resources.get(resource)) ?? fake.settings[key] ?? true,
        target: "user",
      };
    },
    async update(key, value, resource) {
      settingsWrites.push([key, value, resource]);
      if (resource && resources.has(resource)) {
        resources.set(resource, Boolean(value));
      } else {
        fake.settings[key] = value;
      }
      configure();
      return "user";
    },
    searchFilter: "@ext:test.workshop",
    contributed: () => [],
    openUi: async () => {},
  };
  const editors: Editors = {
    all: () => panels,
    active: () => active,
    capture: async () => {
      throw new Error("unused");
    },
    restore: async () => {},
  };
  const root = createRoot({
    logger: {
      debug() {},
      error: (_message, error) => {
        warnings.push(error);
      },
      warn: (_message, error) => {
        warnings.push(error);
      },
    },
  });
  root.provide("workshop", workshop);
  root.provide("vaults", vaults);
  root.provide("editors", editors);
  root.plugin(outlineHost);
  await root.settled();
  await tick();
  return {
    root,
    fake,
    texts,
    opened,
    reveals,
    warnings,
    resources,
    settingsWrites,
    executed,
    view: fake.trees.get(VIEW_ID)!,
    get treeOptions() {
      return treeOptions;
    },
    get followsCursor() {
      return contexts.get(FOLLOW_CURSOR_CONTEXT);
    },
    get commandsAvailable() {
      return contexts.get(COMMANDS_CONTEXT);
    },
    configure,
    panel(id: string, path = "A.md", head = 0) {
      const cursor = {
        head,
        version: 0,
        documentVersion: 1,
        calls: 0,
        capture: (): Promise<{ head: number; version: number }> =>
          Promise.resolve({ head: cursor.head, version: cursor.version }),
      };
      const panel = {
        id,
        document: {
          ...fakeDocument({
            uri: uriOf(path),
            getText: () => texts.get(path) ?? "",
          }),
          get version() {
            return cursor.documentVersion;
          },
        },
        session: {
          get document() {
            return panel.document;
          },
          get version() {
            return cursor.version;
          },
        },
        rpc: {
          async call(_protocol: unknown, method: string) {
            assert.equal(method, "captureCursor");
            cursor.calls++;
            return cursor.capture();
          },
        },
      } as unknown as EditorPanel;
      panels.push(panel);
      return { panel, cursor };
    },
    open(panel: EditorPanel) {
      active = panel;
      root.emit("editor/opened", panel);
    },
    switchTo(panel: EditorPanel | undefined) {
      active = panel;
      root.emit("editor/activeChanged", panel);
    },
    show(isVisible: boolean) {
      visible = isVisible;
      visibilityChanged(isVisible);
    },
  };
}
