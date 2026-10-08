import { metadata } from "../../../src/markdown/metadata";
import type { Vault, Vaults } from "../../../src/plugins/vault/api";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import type {
  HostViews,
  TreeNode,
  TreeSource,
  Workbench,
} from "../../../src/shared/runtime";
import { fakeWorkbench } from "../../support/vscode-fake";

export const ROOT = "memory:///vault";
export const uriOf = (path: string) => `${ROOT}/${encodeURI(path)}`;

/** A Vaults service over one in-memory index built from note texts. */
export function memoryVaults(notes: Record<string, string>) {
  const index = new MemoryVaultIndex({
    root: ROOT,
    folderNote: "",
    linkFormat: "shortest",
  });
  const texts = new Map(Object.entries(notes));
  index.replaceFiles(
    Object.keys(notes).map((path) => ({
      uri: uriOf(path),
      path,
      mtime: 1,
      size: 1,
    })),
  );
  for (const [path, text] of texts) {
    index.setMetadata(path, metadata(text));
  }
  const vault: Vault = {
    index,
    settled: async () => {},
    pathOf: (uri) =>
      uri.startsWith(`${ROOT}/`)
        ? decodeURI(uri.slice(ROOT.length + 1))
        : undefined,
  };
  const opened: { uri: string; offset?: number }[] = [];
  const vaults: Vaults = {
    forDocument: async () => vault,
    forWorkspace: async () => vault,
    locate: async (uri) => {
      const path = vault.pathOf(uri);
      return path === undefined ? undefined : { vault, path };
    },
    text: async (uri) => texts.get(vault.pathOf(uri) ?? "") ?? "",
    open: async (uri, options) => {
      opened.push({ uri, offset: options?.offset });
    },
    all: () => [vault],
  };
  return { vaults, index, texts, opened };
}

/** Host views that record what plugins create, with a settable active note. */
export function fakeViews(settings: Record<string, unknown> = {}) {
  const trees = new Map<
    string,
    { source: TreeSource; message?: string; disposed: boolean }
  >();
  const statuses = new Map<string, { text?: string; disposed: boolean }>();
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const activeListeners = new Set<() => void>();
  let active: string | undefined;
  const prompts: string[] = [];
  let answer: string | undefined;
  let renameListener: Parameters<HostViews["onWillRename"]>[0] | undefined;
  const views: HostViews = {
    tree(id, source) {
      const record = {
        source,
        message: undefined as string | undefined,
        disposed: false,
      };
      trees.set(id, record);
      return {
        refresh() {},
        setMessage: (message) => (record.message = message),
        reveal() {},
        visible: true,
        onVisibilityChanged: () => () => {},
        dispose: () => (record.disposed = true),
      };
    },
    status(id) {
      const record = { text: undefined as string | undefined, disposed: false };
      statuses.set(id, record);
      return {
        show: (text) => (record.text = text),
        hide: () => (record.text = undefined),
        dispose: () => (record.disposed = true),
      };
    },
    pick: async () => undefined,
    ask: async (message) => {
      prompts.push(message);
      return answer;
    },
    command(id, run) {
      commands.set(id, run);
      return () => {
        commands.delete(id);
      };
    },
    activeNote: () => active,
    onActiveNoteChanged(listener) {
      activeListeners.add(listener);
      return () => {
        activeListeners.delete(listener);
      };
    },
    textEditor: () => undefined,
    onTextSelectionChanged: () => () => {},
    documentText: () => undefined,
    setting: (key, fallback) =>
      key in settings ? (settings[key] as never) : fallback,
    onWillRename: (listener) => {
      renameListener = listener;
      return () => {
        renameListener = undefined;
      };
    },
  };
  return {
    views,
    trees,
    statuses,
    commands,
    settings,
    prompts,
    answerWith(value: string | undefined) {
      answer = value;
    },
    rename(renames: { oldUri: string; newUri: string }[]) {
      return renameListener ? renameListener(renames) : Promise.resolve([]);
    },
    setActive(uri: string | undefined) {
      active = uri;
      activeListeners.forEach((listener) => listener());
    },
  };
}

export function workbenchWith(views: HostViews): Workbench {
  const workbench = fakeWorkbench();
  workbench.views = views;
  return workbench;
}

/** Expand a tree fully into labels, for assertions. */
export async function render(
  source: TreeSource,
  depth = 3,
): Promise<unknown[]> {
  const expand = async (nodes: TreeNode[], level: number): Promise<unknown[]> =>
    Promise.all(
      nodes.map(async (node) => {
        const label = node.description
          ? `${node.label} (${node.description})`
          : node.label;
        if (node.expanded === undefined || level >= depth) {
          return label;
        }
        return [label, await expand(await source.children(node), level + 1)];
      }),
    );
  return expand(await source.roots(), 0);
}

export const wait = (ms = 10) =>
  new Promise((resolve) => setTimeout(resolve, ms));
