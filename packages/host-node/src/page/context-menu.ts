/**
 * The editor page's right-click menu outside VS Code (host/context-menu.ts
 * picks the items). The page reports a right-click with the clicked
 * element's context, draws the menu the host answers with, then Cut, Copy
 * and Paste, as VS Code's webview menu ends with them, and answers with the
 * chosen row. The menu never takes focus, so the editor keeps its selection.
 */
import type { MenuContext, MenuRow, PageFrame, UiRequest } from "../protocol";

type Send = (frame: PageFrame) => void;
type MenuRequest = Extract<UiRequest, { type: "menu" }>;

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

interface Entry {
  readonly label: string;
  readonly enabled: boolean;
  /** The host's row index, or a page action. */
  readonly run: number | (() => void);
}

/** One open menu; a new right-click or any answer closes it. */
export class PageMenu {
  private readonly element: HTMLElement;
  private readonly entries: Entry[];
  private active = -1;
  private readonly stop: () => void;

  constructor(
    private readonly request: MenuRequest,
    private readonly send: Send,
  ) {
    this.entries = [];
    this.element = document.createElement("div");
    this.element.className = "lumiere-page-menu";
    this.element.setAttribute("role", "menu");
    this.build();
    document.body.append(this.element);
    this.place();
    this.stop = this.listen();
  }

  close(): void {
    this.answer(null);
  }

  private build(): void {
    let index = 0;
    const groups: Entry[][] = this.request.groups.map((group: MenuRow[]) =>
      group.map((row) => ({ label: row.label, enabled: true, run: index++ })),
    );
    groups.push(editActions());
    groups
      .filter((group) => group.length > 0)
      .forEach((group, position) => {
        if (position > 0) {
          this.element.append(document.createElement("hr"));
        }
        for (const entry of group) {
          this.element.append(this.item(entry, this.entries.length));
          this.entries.push(entry);
        }
      });
  }

  private item(entry: Entry, position: number): HTMLElement {
    const item = document.createElement("div");
    item.setAttribute("role", "menuitem");
    item.textContent = entry.label;
    if (!entry.enabled) {
      item.setAttribute("aria-disabled", "true");
    }
    item.addEventListener("mouseenter", () => this.highlight(position));
    item.addEventListener("click", () => this.choose(position));
    return item;
  }

  /** At the pointer, kept inside the page. */
  private place(): void {
    const { width, height } = this.element.getBoundingClientRect();
    const x = Math.max(4, Math.min(this.request.x, innerWidth - width - 4));
    const y = Math.max(4, Math.min(this.request.y, innerHeight - height - 4));
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  private listen(): () => void {
    // The menu never takes focus: the editor keeps its selection for Copy and Cut.
    const keepFocus = (event: MouseEvent) => event.preventDefault();
    const outside = (event: MouseEvent) => {
      if (!this.element.contains(event.target as Node)) {
        this.close();
      }
    };
    const keys = (event: KeyboardEvent) => this.key(event);
    const close = () => this.close();
    this.element.addEventListener("mousedown", keepFocus);
    window.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", keys, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", keys, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }

  private key(event: KeyboardEvent): void {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      this.move(moves[event.key] ?? 0);
    } else if (event.key === "Enter" && this.active >= 0) {
      this.choose(this.active);
    } else if (event.key === "Escape") {
      this.close();
    } else {
      return;
    }
    // The editor does not see keys meant for the menu.
    event.preventDefault();
    event.stopPropagation();
  }

  private move(step: number): void {
    const count = this.entries.length;
    for (let tries = 0, next = this.active; tries < count; tries++) {
      next = (next + step + count) % count;
      if (this.entries[next]?.enabled) {
        this.highlight(next);
        return;
      }
    }
  }

  private highlight(position: number): void {
    this.active = position;
    this.element.querySelectorAll("[role=menuitem]").forEach((item, at) => {
      item.classList.toggle("active", at === position);
    });
  }

  private choose(position: number): void {
    const entry = this.entries[position];
    if (!entry?.enabled) {
      return;
    }
    if (typeof entry.run === "number") {
      this.answer(entry.run);
    } else {
      this.answer(null);
      entry.run();
    }
  }

  private answer(value: number | null): void {
    if (!this.element.isConnected) {
      return;
    }
    this.stop();
    this.element.remove();
    this.send({
      ch: "ui",
      data: { type: "answer", id: this.request.id, value },
    });
  }
}

/** Cut, Copy and Paste, on the editor's own selection. */
function editActions(): Entry[] {
  const hasSelection = !(document.getSelection()?.isCollapsed ?? true);
  return [
    {
      label: "Cut",
      enabled: hasSelection,
      run: () => document.execCommand("cut"),
    },
    {
      label: "Copy",
      enabled: hasSelection,
      run: () => document.execCommand("copy"),
    },
    { label: "Paste", enabled: true, run: () => void paste() },
  ];
}

/**
 * The clipboard's text, pasted as a paste event so the editor handles it as
 * it handles ⌘V. Never rejects: without clipboard access nothing happens.
 */
async function paste(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    const target = document.activeElement ?? document.body;
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    if (target.dispatchEvent(event)) {
      document.execCommand("insertText", false, text);
    }
  } catch {
    // The reader declined clipboard access, or there is no text.
  }
}
