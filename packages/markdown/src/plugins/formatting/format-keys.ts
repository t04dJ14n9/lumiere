/**
 * Ctrl/Cmd+B / Ctrl/Cmd+I → bold / italic (BH-024).
 * Ctrl/Cmd+D → select next occurrence (BH-028).
 *
 * `@replit/codemirror-vim` maps `<C-b>` → page-back, `<C-i>` → jumplist
 * forward, and `<C-d>` → half-page scroll, so with Vim on the CM Mod-b / Mod-i /
 * Mod-d keymaps never run. Capture-phase ownership matches BH-003 / BH-021 /
 * BH-023: preventDefault + stop so Vim cannot steal the chord. The Vim host
 * `consumeVimHostShortcut` binding for Ctrl+B/I is gated off while formatting
 * is enabled so the host cannot noop the chord before the webview. Ctrl+D is
 * not in the host consume list. Physical PageUp still reaches vim-core via its
 * keyToKey → `<C-b>` path (it is not Ctrl+B). Native text fields keep the
 * chords.
 */

export interface FormatKey {
  key: string;
  keyCode?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type FormatAction = "bold" | "italics" | "selectNext";

/**
 * Map a keydown to bold (B / keyCode 66), italics (I / keyCode 73), or select
 * next (D / keyCode 68). Physical codes cover non-Latin layouts the way
 * history-keys covers Z/Y.
 */
export function formatActionFor(
  event: FormatKey,
  isMac: boolean,
): FormatAction | undefined {
  const modifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  if (key === "b" || event.keyCode === 66) {
    return "bold";
  }
  if (key === "i" || event.keyCode === 73) {
    return "italics";
  }
  if (key === "d" || event.keyCode === 68) {
    return "selectNext";
  }
  return undefined;
}

/** INPUT/TEXTAREA and property contenteditables keep native Ctrl+B/I. */
export function leavesNativeFormat(target: EventTarget | null): boolean {
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

/**
 * Own Mod/Ctrl+B, Mod/Ctrl+I, and Mod/Ctrl+D in capture phase so Vim cannot
 * page-back / jumplist / half-page-scroll steal formatting shortcuts.
 */
export function keepFormatKeys(
  target: Document,
  onFormat: (action: FormatAction) => void,
  leavesNative: (target: EventTarget | null) => boolean = leavesNativeFormat,
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
    const action = formatActionFor(event, isMac);
    if (!action) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    onFormat(action);
  };
  target.addEventListener("keydown", listener, true);
  return () => target.removeEventListener("keydown", listener, true);
}
