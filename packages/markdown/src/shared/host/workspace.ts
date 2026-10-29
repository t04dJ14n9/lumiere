import type { Disposer } from "@workshop/core";
import type { WorkerLauncher } from "../workers";
import type { DiagnosticSink, WorkspaceFiles } from "../workspace-files";

/** The workspace: its folders, trust and files. Plugins pass URIs; the host checks them. */
export interface HostWorkspace {
  folders(): readonly string[];
  isTrusted(): boolean;
  read(uri: string): Promise<Uint8Array>;
  stat(uri: string): Promise<{ mtime: number; symbolicLink: boolean }>;
  /**
   * Whether `uri` is inside `root` once both are resolved through symbolic
   * links on a local disk. Both are `file:` URIs; a missing path rejects.
   * Absent where files have no real path (a browser): links are refused there.
   */
  realContains?(root: string, uri: string): Promise<boolean>;
  /**
   * Hear a file change, appear or go away; it and the folders above it
   * need not exist yet (VS Code's file watchers work this way).
   */
  watch(uri: string, listener: () => void): Disposer;
  /** Create, copy and list workspace files. */
  readonly files: WorkspaceFiles;
  /** Problems panel entries, one owner at a time (a plugin id). */
  readonly diagnostics: DiagnosticSink;
  /** Show a file in a text editor beside the current one (Marp export). */
  revealTextEditor(uri: string): Promise<void>;
}

/** Workspace-scoped storage that outlives the window. */
export interface WorkspaceStorage {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

/** Other extensions, and this extension's own built worker scripts. */
export interface Extensions {
  /** Whether another extension, such as Marp, is installed. */
  isInstalled(id: string): boolean;
  /** Starts the built workers (search; the vault parser has its own). */
  readonly workers: WorkerLauncher;
}
