/**
 * Ctrl/Cmd+A → Select All (BH-029).
 * Ctrl/Cmd+X → Cut when there is a selection (BH-029).
 * Ctrl/Cmd+C → Copy when there is a selection (BH-032).
 * Ctrl/Cmd+V → Paste (BH-032).
 *
 * `@replit/codemirror-vim` maps `<C-a>` → increment, `<C-x>` → decrement,
 * `<C-c>` → Esc, and `<C-v>` → block visual, so with Vim on CM/browser Select
 * All, cut, copy and paste never run. Capture-phase ownership matches BH-023 /
 * BH-028 / BH-031: preventDefault + stop so Vim cannot steal the chord. Empty-
 * selection Ctrl+X is left alone so vim-core can still decrement; empty
 * Ctrl+C is left alone so vim-core can still Esc. Native text fields keep the
 * chords.
 */

export interface EditKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type EditAction = "selectAll" | "cut" | "copy" | "paste";

/**
 * Map a keydown to Select All (A / 65), Cut (X / 88), Copy (C / 67), or Paste
 * (V / 86). Physical codes cover non-Latin layouts the way history-keys covers
 * Z/Y.
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
  if (key === "c" || event.keyCode === 67) {
    return "copy";
  }
  if (key === "v" || event.keyCode === 86) {
    return "paste";
  }
  return undefined;
}

/** INPUT/TEXTAREA, property fields, and table cell editors keep native clipboard chords. */
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
  /** Return true when Copy ran (selection was non-empty). */
  copy: () => boolean;
  /** Return true when Paste ran. */
  paste: () => boolean;
}

/**
 * Own Mod/Ctrl+A always, Mod/Ctrl+V when Paste succeeds, and Mod/Ctrl+X/C when
 * Cut/Copy succeed (non-empty selection), so Vim cannot steal those shortcuts.
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
    } else if (action === "copy") {
      // Let empty-selection Ctrl+C reach vim-core Esc.
      if (!handlers.copy()) {
        return;
      }
    } else if (action === "paste") {
      if (!handlers.paste()) {
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
