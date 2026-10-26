/** The PDF files the viewer shows: reading, watching and naming them. */
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
}
