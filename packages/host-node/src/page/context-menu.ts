/**
 * The editor page's right-click menu outside VS Code (host/context-menu.ts
 * picks the items, page-menu.ts draws them). The page reports a right-click
 * with the clicked element's context, or opens the menu at the selection
 * where there is no right-click.
 */
import type { MenuContext, PageFrame } from "../protocol";

type Send = (frame: PageFrame) => void;

const CONTEXT_ATTRIBUTE = "data-vscode-context";

/**
 * Report the right-clicks the editor leaves alone: its tables and properties
 * draw their own menus and cancel the event first.
 */
export function reportContextMenus(send: Send): void {
  window.addEventListener("contextmenu", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    send({
      ch: "ui",
      data: {
        type: "contextmenu",
        x: event.clientX,
        y: event.clientY,
        context: contextOf(event.target),
      },
    });
  });
}

/**
 * Open the right-click menu at the selection, for a device without a right
 * click (the iPad's edit menu offers More…, embedding.ts). A `contextmenu`
 * at the selection takes the path a right-click takes: the editor stamps
 * what is selected, a table draws its own menu, or the page reports it.
 */
export function openMenuAtSelection(doc: Document): void {
  const spot = menuSpot(doc.getSelection(), doc.activeElement ?? doc.body);
  spot.target.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: spot.x,
      clientY: spot.y,
    }),
  );
}

interface SpotSelection {
  readonly rangeCount: number;
  getRangeAt(index: number): {
    readonly startContainer: Node;
    getBoundingClientRect(): DOMRect;
  };
}

/**
 * Where a menu for the selection opens: under its start, on the element that
 * holds it. A caret's rectangle can be empty, then the element's stands in.
 */
export function menuSpot(
  selection: SpotSelection | null,
  fallback: Element,
): { readonly target: Element; readonly x: number; readonly y: number } {
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  const node = range?.startContainer;
  const target =
    (node && node.nodeType === 1 ? (node as Element) : node?.parentElement) ??
    fallback;
  const rect = range?.getBoundingClientRect();
  const box =
    rect && (rect.width > 0 || rect.height > 0)
      ? rect
      : target.getBoundingClientRect();
  return { target, x: box.left, y: box.bottom };
}

/** VS Code's webview context: the element's `data-vscode-context`, over its parents'. */
export function contextOf(target: EventTarget | null): MenuContext {
  const layers: MenuContext[] = [];
  let node = target instanceof Element ? target : null;
  for (; node; node = node.parentElement) {
    const layer = parseLayer(node.getAttribute(CONTEXT_ATTRIBUTE));
    if (layer) {
      layers.unshift(layer);
    }
  }
  return Object.assign({}, ...layers) as MenuContext;
}

function parseLayer(raw: string | null): MenuContext | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as MenuContext)
      : undefined;
  } catch {
    return undefined;
  }
}
