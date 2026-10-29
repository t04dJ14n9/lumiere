/**
 * A focusout that left the table. CodeMirror detaching the widget because it
 * scrolled out of the viewport also blurs it, but is not that departure: the
 * root is gone and focus fell to the body, so the retained cell stays.
 *
 * Focus in the note's shared Vim status dialog (cell `:` / `/` / `?` proxied
 * onto the outer `.cm-vim-panel`) also stays with the cell session — otherwise
 * the table tears the cell down mid-prompt and orphans the dialog.
 */
export function noteTookTableFocus(
  root: { isConnected: boolean; contains(node: Node | null): boolean },
  active: Node | null,
): boolean {
  return root.isConnected && !tableSessionHoldsFocus(root, active);
}

/**
 * Focus still belongs to the table editing session: inside the table, or in
 * the shared outer Vim status dialog opened from a cell.
 */
export function tableSessionHoldsFocus(
  root: { contains(node: Node | null): boolean },
  active: Node | null,
): boolean {
  if (root.contains(active)) {
    return true;
  }
  return isSharedVimDialogFocus(active);
}

function isSharedVimDialogFocus(active: Node | null): boolean {
  if (!active || typeof (active as Element).closest !== "function") {
    return false;
  }
  return Boolean((active as Element).closest(".cm-vim-panel"));
}

/**
 * Nothing holds focus: unmounting the table left it on the body (or on the
 * editor's root). Anywhere else (the note, the find bar, a menu) is where
 * the reader went meanwhile, and a returning table must not take it away.
 */
export function focusIsUnclaimed(
  document: Pick<Document, "activeElement" | "body" | "documentElement">,
  editorRoot: Element,
): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    active === document.documentElement ||
    active === editorRoot
  );
}

/** Put a retained cell editor back when its table scrolls into view. */
export function resumeRetainedCell(
  root: HTMLElement,
  outer: { dom: Element },
  inner: { contentDOM: HTMLElement } | undefined,
  isActive: boolean,
): void {
  const unclaimed = () => focusIsUnclaimed(root.ownerDocument, outer.dom);
  if (!isActive || !inner || !unclaimed()) {
    return;
  }
  const content = inner.contentDOM;
  // toDOM runs before CodeMirror inserts the widget. Focus after that insert
  // so preventScroll applies to a connected editor.
  queueMicrotask(() => {
    if (!content.isConnected || !unclaimed()) {
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
        if (!tableSessionHoldsFocus(root, root.ownerDocument.activeElement)) {
          leave();
        }
      });
    },
    { signal },
  );
}
