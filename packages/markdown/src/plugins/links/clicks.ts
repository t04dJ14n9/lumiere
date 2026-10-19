import type { EditorView } from "@codemirror/view";

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
 * Clicks on rendered links, as in Obsidian: a click opens the link, Cmd-click
 * in a tab of its own, Cmd+Alt-click beside; Alt- and Shift-clicks place or
 * extend the caret. The press is the link's, so the caret stays put.
 */
export function linkClickHandlers(
  view: EditorView,
  open: OpenLink,
  report: (error: unknown) => void,
) {
  return {
    mousedown(event: MouseEvent) {
      const link = clickedLink(event);
      if (
        event.button === 0 &&
        link?.hasAttribute("data-href") &&
        allowsLinkClick(event, link)
      ) {
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
      event.preventDefault();
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

function isWikiLink(link: HTMLElement): boolean {
  return (
    link.dataset.wiki === "true" || link.classList.contains("internal-link")
  );
}

/** As in Obsidian: Cmd-click opens a tab of its own, Cmd+Alt-click beside. */
export function placeOfClick(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey" | "altKey">,
): { side: boolean; tab: boolean } {
  const mod = event.metaKey || event.ctrlKey;
  return { side: mod && event.altKey, tab: mod && !event.altKey };
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

function allowsLinkClick(event: MouseEvent, link: HTMLElement): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    link.tagName === "A" ||
    (!event.altKey &&
      !event.shiftKey &&
      link.classList.contains("md-link-rendered"))
  );
}
