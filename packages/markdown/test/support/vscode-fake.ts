import type { Configuration } from "../../src/shared/configuration";
import type { DiffViews, GitAccess } from "../../src/shared/git";
import type { HostDocument, HostServices } from "../../src/shared/host";
import type { WorkspaceFiles } from "../../src/shared/workspace-files";
import { gitSource } from "../../src/host/git-source";

/** Members to replace, per host service. */
export type HostOverrides = {
  [K in keyof HostServices]?: Partial<HostServices[K]>;
};

const none = () => () => {};

/**
 * Every host service with harmless defaults (no files, no git, nothing
 * open), each replaced member by member from `overrides`. Tests may also
 * assign members afterwards: each service is its own mutable object.
 */
export function fakeHost(overrides: HostOverrides = {}): HostServices {
  const defaults = defaultHost();
  const host = {} as Record<string, unknown>;
  for (const [name, service] of Object.entries(defaults)) {
    host[name] = {
      ...service,
      ...(overrides[name as keyof HostServices] ?? {}),
    };
  }
  return host as unknown as HostServices;
}

/** Merge several override sets; later members win. */
export function mergeOverrides(...sets: HostOverrides[]): HostOverrides {
  const merged: Record<string, Record<string, unknown>> = {};
  for (const set of sets) {
    for (const [name, members] of Object.entries(set)) {
      merged[name] = { ...merged[name], ...(members as object) };
    }
  }
  return merged as HostOverrides;
}

function defaultHost(): HostServices {
  return {
    hostDocuments: {
      fingerprint: (text) => text,
      apply: async () => false,
      onChange: none,
      onSave: none,
      onWillSave: none,
      open: async (uri) => fakeDocument({ id: uri, uri }),
      rename: async () => {},
      text: () => undefined,
      onWillRename: none,
    },
    hostCommands: { register: none, execute: async () => undefined },
    clipboard: { read: async () => "", write: async () => {} },
    dialogs: {
      error() {},
      inform() {},
      ask: async () => undefined,
      pick: async () => undefined,
      input: async () => undefined,
    },
    views: {
      tree: () => ({
        refresh() {},
        setMessage() {},
        async reveal() {},
        visible: true,
        onVisibilityChanged: none,
        dispose() {},
      }),
      status: () => ({ show() {}, hide() {}, dispose() {} }),
      panel: () => {
        throw new Error("No webview panels in this fake host");
      },
    },
    activeEditor: {
      note: () => undefined,
      onNoteChanged: none,
      textEditor: () => undefined,
      onTextSelectionChanged: none,
      closeSiblingTabs: async () => {},
      customEditorViewType: () => undefined,
    },
    settings: {
      get: (_key, fallback) => fallback,
      forNote: () => ({ preset: "minimal", mode: "source" }),
      onChange: none,
      effective: fakeConfiguration(),
      access: {
        inspect: () => ({ value: undefined, target: "user" }),
        update: async () => "user",
        contributed: () => [],
        searchFilter: "@ext:test.workshop",
        openUi: async () => {},
      },
      editorAssociations: { read: () => undefined, write: async () => {} },
    },
    workspace: {
      folders: () => [],
      isTrusted: () => true,
      vaultCode: {
        answer: () => true,
        request: async () => true,
        onDidChange: none,
      },
      read: async () => new Uint8Array(),
      stat: async () => ({ mtime: 0, symbolicLink: false }),
      watch: none,
      files: unavailableFiles(),
      diagnostics: { replaceAll() {}, clear() {} },
      revealTextEditor: async () => {},
    },
    storage: { get: (_key, fallback) => fallback, update: async () => {} },
    extensions: { isInstalled: () => false, workerPath: () => "" },
    navigation: {
      registerReveal: none,
      registerNativeLinks: none,
      scheme: "vscode",
      external: async () => false,
      confirm: async () => false,
      resolve: async () => undefined,
      open: async () => {},
    },
    customEditors: { register: none },
    agentHost: {
      appName: "Visual Studio Code",
      environment: async () => ({
        target: "auto",
        agentExtensions: new Set(),
        commands: new Set(),
        hasChatParticipant: false,
        chatDisabled: false,
      }),
      writeScratchFile: async (name) => `file:///tmp/${name}`,
    },
    git: noGit(),
    diffViews: noDiffViews(),
  };
}

/** Settings with no values: every read gets its fallback. */
export function fakeConfiguration(): Configuration {
  return {
    get: (_key, fallback) => fallback,
    inspect: () => undefined,
    register: none,
    prepare: async () => {},
    invalidate() {},
    onDidChange: none,
  };
}

function unavailableFiles(): WorkspaceFiles {
  const unavailable = async (): Promise<never> => {
    throw new Error("No workspace files in this fake host");
  };
  return {
    readText: async () => undefined,
    writeText: unavailable,
    list: async () => undefined,
    mkdir: unavailable,
    copy: unavailable,
    move: unavailable,
    remove: unavailable,
    isSymbolicLink: async () => false,
    pickFile: async () => undefined,
  };
}

function noGit(): GitAccess {
  return {
    blameLine: async () => ({ status: "unavailable", repoGeneration: 0 }),
    identity: async () => undefined,
    repoGeneration: () => 0,
    baseline: async () => ({ status: "unavailable" }),
    onDidChange: none,
    stage: async () => false,
    toGitUri: () => undefined,
    // The VS Code adapter's own parser: the diff tests hand it git: URIs.
    sourceOf: gitSource,
  };
}

function noDiffViews(): DiffViews {
  return {
    onDidOpenDiff: none,
    openNative: async () => {},
    show: () => {
      throw new Error("No diff views in this fake host");
    },
  } as unknown as DiffViews;
}

export function fakeDocument(
  overrides: Partial<HostDocument> = {},
): HostDocument {
  return {
    id: "fixture",
    uri: "file:///fixture/Note.md",
    version: 1,
    isDirty: true,
    isUntitled: false,
    eol: "\n",
    getText: () => "note",
    save: async () => true,
    ...overrides,
  };
}

/** `host` with some members replaced, per service; `host` itself is unchanged. */
export function withHost(
  host: HostServices,
  overrides: HostOverrides,
): HostServices {
  const next = { ...host } as Record<string, unknown>;
  for (const [name, members] of Object.entries(overrides)) {
    next[name] = {
      ...(host[name as keyof HostServices] as object),
      ...members,
    };
  }
  return next as unknown as HostServices;
}
