/**
 * The user left the table for the note. A widget CodeMirror detached because
 * it scrolled out of the viewport is not that departure: its root is gone,
 * and focus falling back onto the note must not close the retained cell.
 */
export function noteTookTableFocus(
  root: { isConnected: boolean; contains(node: Node | null): boolean },
  active: Node | null,
): boolean {
  return root.isConnected && !root.contains(active);
}

/** Put a retained cell editor back when its table scrolls into view. */
export function resumeRetainedCell(
  root: HTMLElement,
  outer: { hasFocus: boolean },
  inner: { contentDOM: HTMLElement } | undefined,
  isActive: boolean,
): void {
  if (!isActive || !inner || outer.hasFocus) {
    return;
  }
  const content = inner.contentDOM;
  // toDOM runs before CodeMirror inserts the widget. Focus after that insert
  // so preventScroll applies to a connected editor.
  queueMicrotask(() => {
    if (!content.isConnected || outer.hasFocus) {
      return;
    }
    root.classList.add("has-focus");
    content.focus({ preventScroll: true });
  });
}

/**
 * Table focus while the widget is mounted, retained, or left for the note.
 *
 * Scrolling a focused table out of CodeMirror's viewport detaches its root
 * before the focusout microtask. That unmount must not drop the active cell
 * editor. Focus that actually lands in the note still clears the table.
 */
export function bindTableFocus(options: {
  root: HTMLElement;
  contentDOM: HTMLElement;
  signal: AbortSignal;
  clear: () => void;
}): void {
  const { root, contentDOM, signal, clear } = options;
  root.addEventListener("focusin", () => root.classList.add("has-focus"), {
    signal,
  });
  root.addEventListener(
    "focusout",
    () => {
      // Menu invocation removes its DOM before queuing the command. Give
      // that command a turn to restore cell focus before closing the editor.
      queueMicrotask(() =>
        queueMicrotask(() => {
          const active = root.ownerDocument.activeElement;
          if (!noteTookTableFocus(root, active)) {
            return;
          }
          root.classList.remove("has-focus");
          clear();
        }),
      );
    },
    { signal },
  );
  contentDOM.addEventListener(
    "focusin",
    () => {
      // Reveal focuses the note in the same turn that detaches the widget.
      // Wait until that unmount settles before treating focus as leaving.
      queueMicrotask(() => {
        const active = root.ownerDocument.activeElement;
        if (!noteTookTableFocus(root, active)) {
          return;
        }
        clear();
      });
    },
    { signal },
  );
}
