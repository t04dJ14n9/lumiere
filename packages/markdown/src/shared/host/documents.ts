import type { Disposer } from "@workshop/core";

/** A text document VS Code owns; its text, saving and undo are VS Code's. */
export interface HostDocument {
  readonly id: string;
  readonly uri: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly isUntitled: boolean;
  readonly eol: "\n" | "\r\n";
  getText(): string;
  save(): Promise<boolean>;
}

/** A replacement of `from`–`to` (UTF-16 offsets) by `insert`. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** Original-source offsets from a native document change, including CR characters. */
export interface SourceEdit {
  from: number;
  to: number;
  insert: string;
}

/** Text edits for one file, by line and column (UTF-16 code units). */
export interface FileTextEdits {
  uri: string;
  edits: {
    start: { line: number; col: number };
    end: { line: number; col: number };
    text: string;
  }[];
}

/** VS Code's text documents: edits, saves and renames. */
export interface HostDocuments {
  /** A stable hash of a text, to tell whether a document changed. */
  fingerprint(text: string): string;
  apply(document: HostDocument, edits: readonly TextEdit[]): Promise<boolean>;
  onChange(
    listener: (document: HostDocument, changes?: readonly SourceEdit[]) => void,
  ): Disposer;
  onSave(listener: (document: HostDocument) => void): Disposer;
  /** Awaited before a save; listeners flush pending edits. */
  onWillSave(listener: (document: HostDocument) => Promise<void>): Disposer;
  open(uri: string): Promise<HostDocument>;
  /** Rename the file behind a document (Obsidian's inline title). */
  rename(document: HostDocument, target: string): Promise<void>;
  /** The current text of an open document, saved or not. */
  text(uri: string): string | undefined;
  /** Before files are renamed in VS Code; the edits apply with the rename. */
  onWillRename(
    listener: (
      renames: readonly { oldUri: string; newUri: string }[],
    ) => Promise<readonly FileTextEdits[]>,
  ): Disposer;
}
