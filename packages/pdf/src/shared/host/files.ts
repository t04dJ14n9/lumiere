/** The PDF files the viewer shows: reading, watching, naming, and optional in-place replace. */
export interface PdfFiles {
  /** The file's bytes; rejects when it cannot be read. */
  read(uri: string): Promise<Uint8Array>;
  /**
   * Calls `onChange` when the file is written or replaced. A URI the host
   * cannot watch (not a file) never calls it.
   */
  watch(uri: string, onChange: () => void): () => void;
  /** The path agents and messages show: workspace-relative when inside one, with `/`. */
  displayPath(uri: string): string;
  /** SHA-256 hex of the file on disk. */
  hash?(uri: string): Promise<string>;
  /**
   * Atomically replace the file. Hosts that cannot (non-`file` schemes) omit this;
   * annotation saves then fail with a clear error (no sidecar fallback).
   */
  writeAtomic?(uri: string, bytes: Uint8Array): Promise<{ sha256: string }>;
}
