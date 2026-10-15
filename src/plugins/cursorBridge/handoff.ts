/**
 * Version-safe native TextDocument handoff for Cursor Chat/Edit (B1 + B2).
 * Pure logic: the host supplies warm/open/show and the reclaim lease.
 */

export interface NativeDocument {
  readonly uri: string;
  readonly version: number;
  getText(): string;
  positionAt(offset: number): { line: number; character: number };
}

export interface NativeEditor {
  readonly document: NativeDocument;
  readonly selection: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface HandoffSurface {
  warm(uri: string): Promise<void>;
  open(uri: string): Promise<NativeDocument>;
  show(
    document: NativeDocument,
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    },
  ): Promise<NativeEditor>;
  acquireLease(uri: string): void;
}

export interface SelectionSnapshot {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly version: number;
}

export type HandoffFailure = "changed" | "mismatch" | "inactive";

export type HandoffResult =
  { ok: true; editor: NativeEditor } | { ok: false; reason: HandoffFailure };

/**
 * Acquire the reclaim lease, warm/open the live document, validate version and
 * text, then mirror the selection into a focused native text editor.
 */
export async function handOffSelection(
  surface: HandoffSurface,
  uri: string,
  selection: SelectionSnapshot,
): Promise<HandoffResult> {
  surface.acquireLease(uri);
  await surface.warm(uri);
  const document = await surface.open(uri);
  const validated = validateDocument(document, uri, selection);
  if (!validated.ok) {
    return validated;
  }
  const range = {
    start: document.positionAt(selection.from),
    end: document.positionAt(selection.to),
  };
  const editor = await surface.show(document, range);
  return confirmEditor(editor, uri, selection, range);
}

function validateDocument(
  document: NativeDocument,
  uri: string,
  selection: SelectionSnapshot,
): HandoffResult | { ok: true } {
  if (document.uri !== uri || document.version !== selection.version) {
    return { ok: false, reason: "changed" };
  }
  const { from, to, text } = selection;
  if (from < 0 || to < from || to > document.getText().length) {
    return { ok: false, reason: "mismatch" };
  }
  if (document.getText().slice(from, to) !== text) {
    return { ok: false, reason: "changed" };
  }
  try {
    document.positionAt(from);
    document.positionAt(to);
  } catch {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}

function confirmEditor(
  editor: NativeEditor,
  uri: string,
  selection: SelectionSnapshot,
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  },
): HandoffResult {
  if (
    editor.document.uri !== uri ||
    editor.document.version !== selection.version
  ) {
    return { ok: false, reason: "changed" };
  }
  if (
    !samePosition(editor.selection.start, range.start) ||
    !samePosition(editor.selection.end, range.end)
  ) {
    return { ok: false, reason: "inactive" };
  }
  return { ok: true, editor };
}

function samePosition(
  left: { line: number; character: number },
  right: { line: number; character: number },
): boolean {
  return left.line === right.line && left.character === right.character;
}
