/**
 * A focusout that left the table. CodeMirror detaching the widget because it
 * scrolled out of the viewport also blurs it, but is not that departure: the
 * root is gone and focus fell to the body, so the retained cell stays.
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
 * Menu invocation removes its DOM before queuing the command. Give that
 * command a turn to restore cell focus before deciding the table was left.
 */
function afterFocusSettles(check: () => void): void {
  queueMicrotask(() => queueMicrotask(check));
}

/**
 * Table focus while the widget is mounted, retained, or left for the note.
 *
 * Scrolling a focused table out of CodeMirror's viewport detaches its root,
 * which blurs it. That unmount must not drop the active table. Focus that
 * lands in the note's content clears the table, mounted or not: an unmounted
 * table hears no focusout, so its own focusout cannot report the departure.
 */
export function bindTableFocus(options: {
  root: HTMLElement;
  contentDOM: HTMLElement;
  signal: AbortSignal;
  clear: () => void;
}): void {
  const { root, contentDOM, signal, clear } = options;
  const leave = (): void => {
    root.classList.remove("has-focus");
    clear();
  };
  root.addEventListener("focusin", () => root.classList.add("has-focus"), {
    signal,
  });
  root.addEventListener(
    "focusout",
    () =>
      afterFocusSettles(() => {
        if (noteTookTableFocus(root, root.ownerDocument.activeElement)) {
          leave();
        }
      }),
    { signal },
  );
  contentDOM.addEventListener(
    "focusin",
    (event) => {
      // The table's own cells and grips sit inside the note's content.
      if (root.contains(event.target as Node | null)) {
        return;
      }
      afterFocusSettles(() => {
        if (!root.contains(root.ownerDocument.activeElement)) {
          leave();
        }
      });
    },
    { signal },
  );
}
