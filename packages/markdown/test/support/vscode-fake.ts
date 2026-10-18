import type { WorkerLauncher } from "@workshop/platform";
import type { Configuration } from "../../src/shared/configuration";
import type { DiffViews, GitAccess } from "../../src/shared/git";
import type { HostDocument, HostServices } from "../../src/shared/host";
import type { WorkspaceFiles } from "../../src/shared/workspace-files";

/** The host services of a desktop, where Git exists. */
export type FakeHost = HostServices & { git: GitAccess };

/** Members to replace, per host service. */
export type HostOverrides = {
  [K in keyof FakeHost]?: Partial<FakeHost[K]>;
};

const none = () => () => {};

/**
 * Every host service with harmless defaults (no files, no git, nothing
 * open), each replaced member by member from `overrides`. Tests may also
 * assign members afterwards: each service is its own mutable object.
 */
export function fakeHost(overrides: HostOverrides = {}): FakeHost {
  const defaults = defaultHost();
  const host = {} as Record<string, unknown>;
  for (const [name, service] of Object.entries(defaults)) {
    host[name] = {
      ...service,
      ...(overrides[name as keyof HostServices] ?? {}),
    };
  }
  return host as unknown as FakeHost;
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

function defaultHost(): FakeHost {
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
      read: async () => new Uint8Array(),
      stat: async () => ({ mtime: 0, symbolicLink: false }),
      watch: none,
      files: unavailableFiles(),
      diagnostics: { replaceAll() {}, clear() {} },
      revealTextEditor: async () => {},
    },
    storage: { get: (_key, fallback) => fallback, update: async () => {} },
    extensions: { isInstalled: () => false, workers: noWorkers() },
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

function noWorkers(): WorkerLauncher {
  return {
    start() {
      throw new Error("No workers in this fake host");
    },
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
    sourceOf: (uri) => ({ source: uri }),
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
export function withHost<Host extends HostServices>(
  host: Host,
  overrides: HostOverrides,
): Host {
  const next = { ...host } as Record<string, unknown>;
  for (const [name, members] of Object.entries(overrides)) {
    next[name] = {
      ...(host[name as keyof HostServices] as object),
      ...members,
    };
  }
  return next as unknown as Host;
}
