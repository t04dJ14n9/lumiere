/** Caret offsets in the find field before a match jump. */
export type FindCaret = { start: number; end: number };

/** Read the find field caret (after an `input` event, this is past the edit). */
export function readFindCaret(field: {
  selectionStart: number | null;
  selectionEnd: number | null;
  value: string;
}): FindCaret {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  return { start, end };
}

/**
 * CodeMirror's `findNext` / `findPrevious` call `select()` on `[main-field]`
 * when it is focused (`selectSearchInput`). After an incremental query commit
 * we must put the caret back so the next keystroke appends instead of
 * replacing the whole query (BH-010).
 */
export function restoreFindCaret(
  field: {
    setSelectionRange(start: number, end: number): void;
  },
  active: EventTarget | null,
  caret: FindCaret,
): void {
  if (active === field) {
    field.setSelectionRange(caret.start, caret.end);
  }
}
