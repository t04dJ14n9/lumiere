import { provideHostServices } from "../../../src/shared/host";
import assert from "node:assert/strict";
import { createRoot } from "@workshop/core";
import type { EditorPanel, Editors } from "../../../src/plugins/editor/api";
import { outlineHost } from "../../../src/plugins/outline/host";
import {
  COMMANDS_CONTEXT,
  EXPAND_MODE_SETTING,
  FOLLOW_CURSOR_CONTEXT,
  FOLLOW_CURSOR_SETTING,
  VIEW_ID,
} from "../../../src/plugins/outline/commands";
import type { TreeHandle, TreeNode } from "../../../src/shared/host";
import { fakeDocument, withHost } from "../../support/vscode-fake";
import { fakeViews, memoryVaults, uriOf, hostWith } from "../views/fakes";

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
  const expands: TreeNode[] = [];
  const collapses: TreeNode[] = [];
  let refreshCount = 0;
  // VS Code keeps a node open when refresh does not change collapsibleState.
  // Reveal-expand opens it visually; only expand() records the provider flag
  // that a later collapse can change.
  const providerExpanded = new Map<string, boolean>();
  const visuallyOpen = new Set<string>();
  const openLabels = new Map<string, string>();
  const providerFlag = (node: TreeNode) =>
    providerExpanded.has(node.id)
      ? providerExpanded.get(node.id) === true
      : node.expanded === true;
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
    const base = originalTree(id, source, options);
    const originalRefresh = base.refresh.bind(base);
    return {
      ...base,
      refresh() {
        refreshCount++;
        originalRefresh();
      },
      async reveal(node, options) {
        reveals.push({ node, options });
        openLabels.set(node.id, node.label);
        if (options?.expand) {
          visuallyOpen.add(node.id);
        }
      },
      async expand(node) {
        expands.push(node);
        openLabels.set(node.id, node.label);
        providerExpanded.set(node.id, true);
        visuallyOpen.add(node.id);
      },
      async collapse(node) {
        collapses.push(node);
        openLabels.set(node.id, node.label);
        const wasExpanded = providerFlag(node);
        providerExpanded.set(node.id, false);
        if (wasExpanded) {
          visuallyOpen.delete(node.id);
        }
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
  const host = withHost(hostWith(fake), {
    hostCommands: {
      execute: async (command, key, value) => {
        executed.push(
          [command, key, value].filter((part) => part !== undefined),
        );
        if (command === "setContext") {
          contexts.set(String(key), value);
        }
      },
    },
    settings: {
      onChange: (listener) => {
        configure = listener;
        return () => {
          configure = () => {};
        };
      },
      access: {
        inspect(key, resource) {
          if (key === EXPAND_MODE_SETTING) {
            return {
              value: fake.settings[key] ?? "accordion",
              target: "user" as const,
            };
          }
          assert.equal(key, FOLLOW_CURSOR_SETTING);
          return {
            value:
              (resource && resources.get(resource)) ??
              fake.settings[key] ??
              true,
            target: "user" as const,
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
      },
    },
  });
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
  provideHostServices(root, host);
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
    expands,
    collapses,
    get refreshCount() {
      return refreshCount;
    },
    isOpen(label: string) {
      for (const id of visuallyOpen) {
        if (openLabels.get(id) === label) {
          return true;
        }
      }
      return false;
    },
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
