import { Context } from "../../../src/kernel";
import { EffectiveConfiguration } from "../../../src/host/configuration";
import { readSettings } from "../../../src/host/settings";
import { obsidianCompatHost } from "../../../src/plugins/obsidianCompat/host";
import type { ObsidianCompat } from "../../../src/plugins/obsidianCompat/api";
import { MemoryVaultIndex } from "../../../src/plugins/vault/memory-index";
import type { Vault, Vaults } from "../../../src/plugins/vault/api";
import type { ConfigurationInspection } from "../../../src/shared/configuration";
import { fakeWorkbench } from "../../support/vscode-fake";
import { fakeViews } from "../views/fakes";

export const ROOT_A = "file:///vault-a";
export const ROOT_B = "file:///vault-b";
export const NOTE_A = `${ROOT_A}/notes/A.md`;
export const NOTE_B = `${ROOT_B}/notes/B.md`;

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function compatFixture() {
  const data = new Map<string, string>();
  const failures = new Map<string, Error>();
  const symlinks = new Set<string>();
  const reads: string[] = [];
  const writes: { uri: string; text: string }[] = [];
  const authorizations: { root: string; uri: string }[] = [];
  const watchers = new Map<string, Set<() => void>>();
  const nativeListeners = new Set<() => void>();
  const inspections = new Map<string, ConfigurationInspection>();
  const inspected: { key: string; resource: string }[] = [];
  const values = new Map<string, unknown>();
  const warnings: string[] = [];
  const hooks: {
    beforeWrite?: (uri: string) => Promise<void>;
    beforeRead?: (uri: string) => Promise<void>;
    beforeMkdir?: () => Promise<void>;
  } = {};
  const focus = { uri: undefined as string | undefined };
  const configuration = new EffectiveConfiguration({
    get(key, resource) {
      const layers = inspections.get(`${resource}|${key}`);
      const explicit = Object.entries(layers ?? {}).find(
        ([layer, value]) =>
          /^(global|workspace).*Value$/.test(layer) && value !== undefined,
      );
      return explicit ? explicit[1] : values.get(key);
    },
    inspect(key, resource) {
      inspected.push({ key, resource });
      return (
        inspections.get(`${resource}|${key}`) ?? {
          defaultValue: values.get(key),
        }
      );
    },
    onDidChange(listener) {
      nativeListeners.add(listener);
      return () => {
        nativeListeners.delete(listener);
      };
    },
  });
  const vaults = [ROOT_A, ROOT_B].map((root): Vault => ({
    index: new MemoryVaultIndex({
      root,
      folderNote: "",
      linkFormat: "shortest",
    }),
    settled: async () => {},
    pathOf: (uri) =>
      uri.startsWith(`${root}/`) ? uri.slice(root.length + 1) : undefined,
  }));
  const vaultService: Vaults = {
    async forDocument(uri: string) {
      const vault = vaults.find(
        (item) => uri === item.index.root || item.pathOf(uri) !== undefined,
      );
      if (!vault) {
        throw new Error(`Unknown document: ${uri}`);
      }
      return vault;
    },
    all: () => vaults,
    forWorkspace: async () => vaults[0],
    async locate(uri) {
      const vault = await this.forDocument(uri);
      const path = vault.pathOf(uri);
      return path === undefined ? undefined : { vault, path };
    },
    text: async (uri) => data.get(uri) ?? "",
    open: async () => {},
    registerLinkPolicy: () => () => {},
    invalidateLinkResolution() {},
  };
  const fake = fakeViews();
  const workbench = fakeWorkbench({
    configuration,
    onConfiguration: (listener) => configuration.onDidChange(listener),
    config: (document) =>
      readSettings({
        get: (key, fallback) => configuration.get(key, fallback, document.uri),
      }),
    views: {
      ...fake.views,
      activeNote: () => focus.uri,
      setting: (key, fallback, resource) =>
        configuration.get(key, fallback, resource),
    },
    async read(uri) {
      reads.push(uri);
      await hooks.beforeRead?.(uri);
      const failure = failures.get(uri);
      if (failure) {
        throw failure;
      }
      const text = data.get(uri);
      if (text === undefined) {
        throw Object.assign(new Error("Missing"), { code: "FileNotFound" });
      }
      return new TextEncoder().encode(text);
    },
    files: {
      async authorize(root, uri) {
        authorizations.push({ root, uri });
        if (
          !uri.startsWith(`${root}/`) ||
          [...symlinks].some(
            (path) => uri === path || uri.startsWith(`${path}/`),
          )
        ) {
          throw new Error("Path escapes the vault through a symlink");
        }
      },
      readText: async () => {
        throw new Error("readText hides errors and must not be used");
      },
      async writeText(uri, text) {
        await hooks.beforeWrite?.(uri);
        writes.push({ uri, text });
        data.set(uri, text);
      },
      mkdir: async () => {
        await hooks.beforeMkdir?.();
      },
      list: async () => [],
      copy: async () => {},
      move: async () => {},
      remove: async () => {},
      isSymbolicLink: async (uri) => symlinks.has(uri),
      pickFile: async () => undefined,
    },
    watchFile(uri, listener) {
      const listeners = watchers.get(uri) ?? new Set<() => void>();
      watchers.set(uri, listeners);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          watchers.delete(uri);
        }
      };
    },
  });
  const root = Context.create({
    logger: {
      debug() {},
      error() {},
      warn: (message) => {
        warnings.push(message);
      },
    },
  });
  root.provide("workshop", workbench);
  root.provide("vaults", vaultService);
  const fiber = root.plugin(obsidianCompatHost);
  await root.settled();
  const flush = async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await root.settled();
  };
  return {
    root,
    fiber,
    workbench,
    configuration,
    values,
    inspections,
    inspected,
    data,
    failures,
    symlinks,
    reads,
    writes,
    authorizations,
    warnings,
    watchers,
    nativeListeners,
    hooks,
    focus,
    vaults: vaultService,
    viewsFake: fake,
    service: root.runtime.value("obsidianCompat") as ObsidianCompat,
    async change(uri: string, text: string | undefined) {
      if (text === undefined) {
        data.delete(uri);
      } else {
        data.set(uri, text);
      }
      for (const listener of watchers.get(uri) ?? []) {
        listener();
      }
      await flush();
    },
    async changeSettings() {
      for (const listener of nativeListeners) {
        listener();
      }
      await flush();
    },
    flush,
  };
}
