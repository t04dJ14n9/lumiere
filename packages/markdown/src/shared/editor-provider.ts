/**
 * An editor the extension contributes, described in terms the VS Code
 * adapter needs and nothing more. The adapter (`src/host/editor-panels.ts`)
 * registers any provider it is given; it never inspects the document kind
 * or language. The `editor` plugin is the only one that registers
 * `MARKDOWN_EDITOR`; other code reads its `viewType` and `filenamePatterns`
 * from here instead of repeating them. A second editor (for another file
 * type) would be a second provider registered by its own editor plugin.
 */
export interface EditorProvider {
  /** The VS Code custom editor id. */
  readonly viewType: string;
  readonly displayName: string;
  /** Files it opens, as `workbench.editorAssociations` patterns. */
  readonly filenamePatterns: readonly string[];
  /**
   * `text`: a CustomTextEditorProvider over VS Code's text document, which
   * owns saving, undo and dirty state.
   */
  readonly document: "text";
  /** `option`: offered in Reopen With and by associations, never forced. */
  readonly priority: "default" | "option";
  readonly retainContextWhenHidden: boolean;
  readonly multipleEditorsPerDocument: boolean;
}

export const MARKDOWN_EDITOR: EditorProvider = Object.freeze({
  viewType: "lumiere.markdown.editor",
  displayName: "Lumière",
  filenamePatterns: Object.freeze(["*.md", "*.markdown"]),
  document: "text",
  priority: "option",
  retainContextWhenHidden: true,
  multipleEditorsPerDocument: true,
});

/** `activeCustomEditorId == '<viewType>'`, for when-clauses. */
export function whenActive(provider: EditorProvider): string {
  return `activeCustomEditorId == '${provider.viewType}'`;
}
