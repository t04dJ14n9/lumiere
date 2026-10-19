import type { Disposer } from "@workshop/core";
import type { DiagnosticSink, WorkspaceFiles } from "../workspace-files";

/** The workspace: its folders, trust and files. Plugins pass URIs; the host checks them. */
export interface HostWorkspace {
  folders(): readonly string[];
  isTrusted(): boolean;
  read(uri: string): Promise<Uint8Array>;
  stat(uri: string): Promise<{ mtime: number; symbolicLink: boolean }>;
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
  workerPath(name: "search"): string;
}
