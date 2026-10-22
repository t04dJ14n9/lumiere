/**
 * Ctrl/Cmd+A → Select All (BH-029).
 * Ctrl/Cmd+X → Cut when there is a selection (BH-029).
 *
 * `@replit/codemirror-vim` maps `<C-a>` → increment and `<C-x>` → decrement, so
 * with Vim on CM/browser Select All and cut never run. Capture-phase ownership
 * matches BH-023 / BH-028: preventDefault + stop so Vim cannot steal the chord.
 * Empty-selection Ctrl+X is left alone so vim-core can still decrement. Native
 * text fields keep the chords.
 */

export interface EditKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type EditAction = "selectAll" | "cut";

/**
 * Map a keydown to Select All (A / keyCode 65) or Cut (X / keyCode 88).
 * Physical codes cover non-Latin layouts the way history-keys covers Z/Y.
 */
export function editActionFor(
  event: EditKey,
  isMac: boolean,
): EditAction | undefined {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  if (key === "a" || event.keyCode === 65) {
    return "selectAll";
  }
  if (key === "x" || event.keyCode === 88) {
    return "cut";
  }
  return undefined;
}

/** INPUT/TEXTAREA, property fields, and table cell editors keep native Ctrl+A/X. */
export function leavesNativeEdit(target: EventTarget | null): boolean {
  if (!target || !("tagName" in target)) {
    return isNestedNativeEditor(target);
  }
  const tag = String(
    (target as { tagName?: string }).tagName ?? "",
  ).toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return true;
  }
  return isNestedNativeEditor(target);
}

function isNestedNativeEditor(target: EventTarget | null): boolean {
  const element = elementForClosest(target);
  if (!element || typeof element.closest !== "function") {
    return false;
  }
  // Table cells are nested CM editors; note-level Select All/Cut must not steal
  // their Ctrl+A/X (browser tables-parity / tables-measured specs).
  return !!element.closest(
    "[data-property-input], [data-property-list-input], .table-cell-content",
  );
}

function elementForClosest(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object") {
    return null;
  }
  const node = target as Partial<Node> & {
    nodeType?: number;
    parentElement?: Element | null;
    closest?: Element["closest"];
  };
  if (typeof node.closest === "function") {
    return node as Element;
  }
  if (node.nodeType === 3 && node.parentElement) {
    return node.parentElement;
  }
  return null;
}

export interface EditKeyHandlers {
  selectAll: () => void;
  /** Return true when Cut ran (selection was non-empty). */
  cut: () => boolean;
}

/**
 * Own Mod/Ctrl+A always, and Mod/Ctrl+X when Cut succeeds (non-empty
 * selection), so Vim cannot increment / decrement steal those shortcuts.
 */
export function keepEditKeys(
  target: Document,
  handlers: EditKeyHandlers,
  leavesNative: (target: EventTarget | null) => boolean = leavesNativeEdit,
): () => void {
  if (!target || typeof target.addEventListener !== "function") {
    return () => {};
  }
  const isMac = /Mac|iPhone|iPad/.test(
    target.defaultView?.navigator.platform ?? "",
  );
  const listener = (event: KeyboardEvent) => {
    if (leavesNative(event.target)) {
      return;
    }
    const action = editActionFor(event, isMac);
    if (!action) {
      return;
    }
    if (action === "cut") {
      // Let empty-selection Ctrl+X reach vim-core decrement.
      if (!handlers.cut()) {
        return;
      }
    } else {
      handlers.selectAll();
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
