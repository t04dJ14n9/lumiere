/**
 * Version-safe native TextDocument handoff for Cursor Chat/Edit (B1 + B2).
 * Pure logic: the host supplies warm/open/show and the reclaim lease.
 */

export interface EditPromptVisibility {
  readonly visible: boolean;
  onVisibilityChanged(listener: (visible: boolean) => void): () => void;
}

export interface NativeDocument {
  readonly uri: string;
  readonly version: number;
  getText(): string;
  positionAt(offset: number): { line: number; character: number };
}

export interface NativeEditor {
  /** Live values: revalidation must observe changes after show() resolves. */
  readonly document: NativeDocument;
  readonly selection: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  isActive(): boolean;
}

export interface HandoffLease {
  /** A confirmed native editor now owns this pending acquisition. */
  promote(): void;
  /** Release only this handoff, even when another one uses the same URI. */
  release(): void;
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
  acquireLease(uri: string): HandoffLease;
  /** vscode.Uri for Cursor Edit overrideUri (keeps plugin host vscode-free). */
  nativeUri(uri: string): unknown;
  /** Best-effort: report when Cursor Edit UI for this URI ends; dispose cancels. */
  watchEditEnd(
    uri: string,
    onEnd: (end: { restore: boolean }) => void,
    prompt: EditPromptVisibility,
  ): { dispose(): void };
  /**
   * Close or hide the native mirror for this URI so focus can return to the
   * Workshop custom editor when Edit fails or its session ends.
   * Pass `{ restore: false }` when the reader already closed the mirror
   * (Ctrl+W / Close All) so Live Preview is not brought back.
   * Pass `promptId` from a successful Edit so Cursor's prompt bar is closed
   * before the mirror goes away — leftover bars make the next Ctrl+K no-op.
   */
  dismiss(
    uri: string,
    options?: { restore?: boolean; promptId?: string },
  ): Promise<void>;
  /**
   * Close a prompt bar stashed when dismiss could not (mirror already gone).
   * Call before the next Edit so `modal.generate` does not reuse a dead bar.
   */
  clearStaleEditPrompt?(uri: string): void | Promise<void>;
}

export interface SelectionSnapshot {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly version: number;
}

export type HandoffFailure = "changed" | "mismatch" | "inactive";

type HandoffRejected = { ok: false; reason: HandoffFailure };
type EditorConfirmation = { ok: true; editor: NativeEditor } | HandoffRejected;

export type HandoffResult =
  { ok: true; editor: NativeEditor; lease: HandoffLease } | HandoffRejected;

export type PreparedMirror =
  | {
      ok: true;
      lease: HandoffLease;
      document: NativeDocument;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    }
  | HandoffRejected;

/**
 * Acquire the reclaim lease, warm/open the live document, and validate version
 * and text — without showing a native tab. Used by Edit’s override-only path.
 */
export async function prepareNativeMirror(
  surface: HandoffSurface,
  uri: string,
  selection: SelectionSnapshot,
): Promise<PreparedMirror> {
  const lease = surface.acquireLease(uri);
  let isHandedOff = false;
  try {
    // Sync no-op when nothing is stashed so warm still starts before the
    // first await (handoff-host tests assert that timing).
    const clearing = surface.clearStaleEditPrompt?.(uri);
    if (clearing) {
      await clearing;
    }
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
    isHandedOff = true;
    return { ok: true, lease, document, range };
  } finally {
    if (!isHandedOff) {
      lease.release();
    }
  }
}

/**
 * Acquire the reclaim lease, warm/open the live document, validate version and
 * text, then mirror the selection into a focused native text editor.
 */
export async function handOffSelection(
  surface: HandoffSurface,
  uri: string,
  selection: SelectionSnapshot,
): Promise<HandoffResult> {
  const prepared = await prepareNativeMirror(surface, uri, selection);
  if (!prepared.ok) {
    return prepared;
  }
  let isHandedOff = false;
  try {
    const editor = await surface.show(prepared.document, prepared.range);
    const confirmed = confirmActiveEditor(editor, uri, selection);
    if (!confirmed.ok) {
      return confirmed;
    }
    prepared.lease.promote();
    isHandedOff = true;
    return { ...confirmed, lease: prepared.lease };
  } finally {
    if (!isHandedOff) {
      prepared.lease.release();
    }
  }
}

function validateDocument(
  document: NativeDocument,
  uri: string,
  selection: SelectionSnapshot,
): HandoffRejected | { ok: true } {
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

/** Synchronous final check; invoke Cursor immediately after it succeeds. */
export function confirmActiveEditor(
  editor: NativeEditor,
  uri: string,
  selection: SelectionSnapshot,
): EditorConfirmation {
  if (!editor.isActive()) {
    return { ok: false, reason: "inactive" };
  }
  const validated = validateDocument(editor.document, uri, selection);
  if (!validated.ok) {
    return validated;
  }
  const range = {
    start: editor.document.positionAt(selection.from),
    end: editor.document.positionAt(selection.to),
  };
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
