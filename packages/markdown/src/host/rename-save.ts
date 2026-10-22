import type { FileTextEdits } from "../shared/host";

/** Files a link update edits that had no unsaved changes of their own. */
export function cleanEditedUris(
  files: readonly FileTextEdits[],
  isDirty: (uri: string) => boolean,
): string[] {
  return files
    .filter((file) => file.edits.length > 0 && !isDirty(file.uri))
    .map((file) => file.uri);
}

type LineEdit = FileTextEdits["edits"][number];

/** UTF-16 offset of `(line, col)` in `text` (0-based, LF/CRLF line breaks). */
export function offsetAt(text: string, line: number, col: number): number {
  let start = 0;
  for (let i = 0; i < line; i++) {
    const next = text.indexOf("\n", start);
    if (next < 0) {
      return text.length;
    }
    start = next + 1;
  }
  return Math.min(start + col, text.length);
}

/**
 * Apply line/column replacements to a note's text. Later ranges are applied
 * first so earlier offsets stay valid — the same order WorkspaceEdit uses.
 */
export function applyLineColEdits(
  text: string,
  edits: readonly LineEdit[],
): string {
  const ordered = edits
    .map((edit) => ({
      from: offsetAt(text, edit.start.line, edit.start.col),
      to: offsetAt(text, edit.end.line, edit.end.col),
      insert: edit.text,
    }))
    .sort((a, b) => b.from - a.from || b.to - a.to);
  let result = text;
  for (const edit of ordered) {
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  }
  return result;
}

/**
 * Planned final text for notes open in a Lumière custom editor. Used after
 * the rename to apply link updates that VS Code's onWill WorkspaceEdit does
 * not land on CustomTextEditor buffers (BH-014).
 */
export function expectedOpenEditorText(
  files: readonly FileTextEdits[],
  openText: (uri: string) => string | undefined,
): Map<string, string> {
  const expected = new Map<string, string>();
  for (const file of files) {
    if (file.edits.length === 0) {
      continue;
    }
    const text = openText(file.uri);
    if (text === undefined) {
      continue;
    }
    expected.set(file.uri, applyLineColEdits(text, file.edits));
  }
  return expected;
}

/**
 * Split link-update edits into notes open in Lumière (apply+save ourselves)
 * and closed notes (waitUntil WorkspaceEdit + saveAfterRename so disk is
 * written without a manual Save — Obsidian parity).
 */
export function partitionLinkUpdateFiles(
  files: readonly FileTextEdits[],
  lumiereOpenUris: ReadonlySet<string>,
  openText: (uri: string) => string | undefined,
): {
  open: Map<string, string>;
  closed: FileTextEdits[];
} {
  const open = expectedOpenEditorText(files, (uri) =>
    lumiereOpenUris.has(uri) ? openText(uri) : undefined,
  );
  return {
    open,
    closed: files.filter((file) => !open.has(file.uri)),
  };
}
