/**
 * Lumière PDF's settings (`lumiere.pdf.*`) and the editor settings it
 * follows (`editor.smoothScrolling`), as the host keeps them. Only the PDF
 * product reads and writes `lumiere.pdf.` keys (AGENTS.md).
 */
export interface PdfConfiguration {
  /**
   * A setting by its full key, as it applies to the file at `resource` (a
   * URI); undefined when the host has no such setting.
   */
  get(key: string, resource?: string): unknown;
  /** `affects(section)`: whether the change touched that key or a key below it. */
  onChange(
    listener: (affects: (section: string) => boolean) => void,
  ): () => void;
}

/** State the viewer keeps between sessions, such as where each PDF was left. */
export interface PdfState {
  get(key: string): unknown;
  update(key: string, value: unknown): Promise<void>;
}
