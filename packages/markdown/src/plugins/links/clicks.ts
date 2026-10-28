import type { EditorView } from "@codemirror/view";
import { selectRenderedSource } from "../../webview/ui/source-selection";

/** Where a link opens (beside, or in a tab of its own), and the note it is in. */
export interface OpenOptions {
  side?: boolean;
  tab?: boolean;
  source?: string;
}

export type OpenLink = (
  href: string,
  wiki: boolean,
  options?: OpenOptions,
) => Promise<boolean>;

/**
 * Clicks on rendered links (BH-020 + Alt-edit):
 * plain click does not follow — CodeMirror places the caret so the link source
 * reveals; Ctrl/Cmd-click follows in the same editor; Ctrl/Cmd+Alt-click opens
 * beside; Alt alone places a single caret to edit the link source (no
 * multi-cursor); Shift-click extends the selection without following. The
 * Mod-press is the link's, so the caret stays put while the link opens.
 */
export function linkClickHandlers(
  view: EditorView,
  open: OpenLink,
  report: (error: unknown) => void,
) {
  return {
    mousedown(event: MouseEvent) {
      const link = clickedLink(event);
      if (event.button !== 0 || !link?.hasAttribute("data-href")) {
        return false;
      }
      // Alt alone on a rendered link: Obsidian places one caret to edit.
      // Without this, EditorView.clickAddsSelectionRange adds a second caret
      // and the next keys insert at both the old caret and the link.
      if (isAltEditLinkClick(event, link)) {
        event.preventDefault();
        event.stopPropagation();
        placeCaretToEditLink(view, link, event);
        return true;
      }
      // BH-020: only Mod-click follows; preventDefault so CM does not also move.
      if (allowsLinkClick(event, link)) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    },
    click(event: MouseEvent) {
      const link = clickedLink(event);
      if (!link) {
        return false;
      }
      // Always stop <a href> navigation; only Mod follows through `open`.
      event.preventDefault();
      if (isAltEditLinkClick(event, link)) {
        return true;
      }
      const selection = view.dom.ownerDocument.getSelection();
      if (
        !allowsLinkClick(event, link) ||
        (selection &&
          !selection.isCollapsed &&
          (link.contains(selection.anchorNode) ||
            link.contains(selection.focusNode)))
      ) {
        return true;
      }
      const href = link.getAttribute("href") ?? link.dataset.href;
      const source =
        link.closest<HTMLElement>("[data-note-source]")?.dataset.noteSource;
      if (href) {
        void open(href, isWikiLink(link), {
          ...placeOfClick(event),
          ...(source === undefined ? {} : { source }),
        }).catch((error) => report(error));
      }
      return true;
    },
  };
}

/**
 * Whether Alt alone on a rendered LP link should place a single edit caret
 * instead of opening the link or adding a CodeMirror multi-cursor.
 */
export function isAltEditLinkClick(
  event: Pick<
    MouseEvent,
    "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "button"
  >,
  link: { classList: { contains(name: string): boolean } },
): boolean {
  return (
    event.button === 0 &&
    event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    link.classList.contains("md-link-rendered")
  );
}

function placeCaretToEditLink(
  view: EditorView,
  link: HTMLElement,
  event: MouseEvent,
): void {
  const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
  const at = Math.max(
    0,
    Math.min(
      view.state.doc.length,
      coords ?? view.posAtDOM(link, Math.floor(link.childNodes.length / 2)),
    ),
  );
  selectRenderedSource(view, { from: at, to: at }, { settled: true });
}

function isWikiLink(link: HTMLElement): boolean {
  return (
    link.dataset.wiki === "true" || link.classList.contains("internal-link")
  );
}

/**
 * Where a Mod-follow opens. Once plain click reveals (BH-020), Ctrl/Cmd alone
 * means "follow" in the **same** editor (`tab: false`) — preferred over the
 * older Obsidian-when-plain-opens mapping that treated every Mod-follow as a
 * new tab. Ctrl/Cmd+Alt still opens beside. New-tab remains
 * `editor:open-link-in-new-leaf` / the command palette.
 */
export function placeOfClick(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey" | "altKey">,
): { side: boolean; tab: boolean } {
  const mod = event.metaKey || event.ctrlKey;
  return { side: mod && event.altKey, tab: false };
}

const LINK = "a, [data-href]";

function clickedLink(event: MouseEvent): HTMLElement | null {
  if (!(event.target instanceof Element)) {
    return null;
  }
  const line = event.target.closest(".cm-line");
  return (
    event.target.closest<HTMLElement>(LINK) ??
    (line ? linkUnder(line, event.clientX, event.clientY) : null)
  );
}

/**
 * The link whose box holds the point. Chromium hit-tests the last pixel or
 * so of an inline link's text as its line, so a click there names the line.
 */
function linkUnder(line: Element, x: number, y: number): HTMLElement | null {
  for (const link of line.querySelectorAll<HTMLElement>(LINK)) {
    if ([...link.getClientRects()].some((box) => holds(box, x, y))) {
      return link;
    }
  }
  return null;
}

/** Whether a box holds a point: its left and top edges in, right and bottom out. */
export function holds(
  box: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  x: number,
  y: number,
): boolean {
  return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
}

/**
 * Follow when Ctrl (Linux) or Cmd (macOS) is held, or on a plain click inside
 * a rendered HTML `<a>` link (table cells, callouts, note embeds, page preview).
 */
export function allowsLinkClick(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
  link?: { tagName?: string },
): boolean {
  return event.metaKey || event.ctrlKey || link?.tagName === "A";
}
