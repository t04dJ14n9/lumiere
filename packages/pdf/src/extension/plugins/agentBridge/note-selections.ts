import type * as vscode from "vscode";

/** The text selected in a Markdown note, with its 1-based line range. */
export interface NoteSelection {
  readonly uri: vscode.Uri;
  readonly text: string;
  readonly startLine: number;
  readonly endLine: number;
  /** Unsaved: the line numbers may not match the file on disk. */
  readonly isDirty: boolean;
}

/**
 * What the agent bridge needs from the Markdown editor (Markdown Workshop,
 * in the same extension); the composition root provides it.
 */
export interface NoteSelections {
  /** Whether any note is open in the Markdown editor. */
  hasOpenNotes(): boolean;
  /** The active note's selection, else the first open note's; none if empty. */
  current(): Promise<NoteSelection | undefined>;
}
