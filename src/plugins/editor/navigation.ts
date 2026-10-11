import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/** Only deliberate jumps pass through here; typing, scrolling and Vim do not. */
const observers = new WeakMap<EditorView, Set<() => () => void>>();
const navigating = new WeakSet<EditorView>();

export function observeNavigation(view: EditorView, capture: () => () => void) {
  const listeners = observers.get(view) ?? new Set<() => () => void>();
  observers.set(view, listeners);
  listeners.add(capture);
  return () => {
    listeners.delete(capture);
  };
}

export function runNavigation<T>(view: EditorView, jump: () => T): T {
  if (navigating.has(view)) {
    return jump();
  }
  navigating.add(view);
  try {
    const complete = captureNavigation(view);
    const result = jump();
    if (result !== false) {
      complete();
    }
    return result;
  } finally {
    navigating.delete(view);
  }
}

/** Capture before passive previews, then finish only when a result is accepted. */
export function captureNavigation(view: EditorView): () => void {
  const complete = [...(observers.get(view) ?? [])].map((capture) => capture());
  return () => {
    for (const finish of complete) {
      finish();
    }
  };
}

/** A synced revision alone cannot detect local edits that are still in flight. */
export function isCurrentReveal(
  requested: number | undefined,
  synced: number,
  hasPendingEdits: boolean,
): boolean {
  return requested === undefined || (requested === synced && !hasPendingEdits);
}

/** Compare the effective dispatch result, including selection filters. */
export function revealUnchanged(
  applied: EditorState,
  current: EditorState,
): boolean {
  return applied.doc.eq(current.doc) && applied.selection.eq(current.selection);
}

export interface NavigationStamp {
  session: string;
  generation: number;
}
const readers = new WeakMap<EditorView, () => NavigationStamp>();
export function observeReader(view: EditorView, read: () => NavigationStamp) {
  readers.set(view, read);
  return () => {
    readers.delete(view);
  };
}
export function readerStamp(view: EditorView): NavigationStamp | undefined {
  return readers.get(view)?.();
}
export function sameReader(
  a: NavigationStamp | undefined,
  b: NavigationStamp | undefined,
): boolean {
  return a?.session === b?.session && a?.generation === b?.generation;
}
