/**
 * Ctrl/Cmd+F → Find; Ctrl/Cmd+H → Replace (BH-023 / BH-025), except Vim INSERT
 * Ctrl+H (BH-045).
 *
 * `@replit/codemirror-vim` maps `<C-f>` → page-forward by default, so with Vim
 * on the CM Mod-f keymap never runs and Find stays closed. Capture-phase
 * ownership matches BH-003 / BH-021 / BH-024: preventDefault + stop so Vim
 * cannot page and the workbench cannot open its empty custom-editor Find.
 * Ctrl/Cmd+H is owned the same way so Replace opens with the replace row
 * (BH-025). vim-core does not map `<C-h>`, but CM's standard keymap binds
 * Ctrl-h → deleteCharBackward; without an insert gate our capture steals
 * backspace-in-insert for Replace (BH-045). Physical PageDown still reaches
 * vim-core (it is not Ctrl+F). Native text fields keep Ctrl+F / Ctrl+H.
 */

export interface FindKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type FindAction = "find" | "replace";

/**
 * Map a keydown to Find (F / keyCode 70) or Replace (H / keyCode 72). Physical
 * codes cover non-Latin layouts the way history-keys covers Z/Y.
 */
export function findActionFor(
  event: FindKey,
  isMac: boolean,
): FindAction | undefined {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  if (key === "f" || event.keyCode === 70) {
    return "find";
  }
  if (key === "h" || event.keyCode === 72) {
    return "replace";
  }
  return undefined;
}

/** INPUT/TEXTAREA and property contenteditables keep native Ctrl+F / Ctrl+H. */
export function leavesNativeFind(target: EventTarget | null): boolean {
  if (!target || !("tagName" in target)) {
    return isPropertyNativeEditor(target);
  }
  const tag = String(
    (target as { tagName?: string }).tagName ?? "",
  ).toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return true;
  }
  return isPropertyNativeEditor(target);
}

function isPropertyNativeEditor(target: EventTarget | null): boolean {
  const element = elementForClosest(target);
  if (!element || typeof element.closest !== "function") {
    return false;
  }
  return !!element.closest("[data-property-input], [data-property-list-input]");
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

export interface KeepFindKeyOptions {
  /**
   * When true, Ctrl/Cmd+H is Vim INSERT backspace (CM Ctrl-h → deleteCharBackward)
   * — do not open Replace. BH-045.
   */
  isInsertMode?: () => boolean;
  /** Run instead of Replace when `isInsertMode()` is true (delete prior char). */
  onInsertCtrlH?: () => void;
}

/**
 * Own Mod/Ctrl+F and Mod/Ctrl+H in capture phase so Find/Replace beat Vim and
 * the workbench empty custom-editor find widget. Optional insert-mode gate
 * leaves Ctrl+H backspace to the editor (BH-045).
 */
export function keepFindKey(
  target: Document,
  onAction: (replace: boolean) => void,
  leavesNative: (target: EventTarget | null) => boolean = leavesNativeFind,
  options: KeepFindKeyOptions = {},
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
    const action = findActionFor(event, isMac);
    if (!action) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (action === "replace" && options.isInsertMode?.()) {
      options.onInsertCtrlH?.();
      return;
    }
    onAction(action === "replace");
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
