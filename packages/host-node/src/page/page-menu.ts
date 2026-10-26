/**
 * The right-click menu the page draws when the host asks (`menu`): the
 * host's rows, then Cut, Copy and Paste, as VS Code's webview menu ends with
 * them. A submenu's row opens its rows beside it, on a tap or a click, on
 * Right or Enter, or when a mouse rests on it. The page answers with the
 * chosen command row. The menu never takes focus, so the editor keeps its
 * selection.
 */
import type { PageFrame, UiRequest } from "../protocol";
import {
  isSubmenu,
  keepInside,
  menuEntries,
  menuMove,
  nextEnabled,
  submenuSpot,
  type CommandEntry,
  type MenuEntry,
  type MenuMove,
} from "./menu-model";

type Send = (frame: PageFrame) => void;
type MenuRequest = Extract<UiRequest, { type: "menu" }>;

/**
 * How long a mouse rests on a row before its submenu opens, or another
 * closes: long enough to cross a row on the way into an open submenu.
 */
const HOVER_DELAY = 200;

interface PanelEvents {
  hover(position: number, pointerType: string): void;
  press(position: number): void;
}

/** One open menu: the page menu itself, or a submenu beside its row. */
class MenuPanel {
  readonly element = document.createElement("div");
  private readonly rows: HTMLElement[] = [];
  private readonly entries: MenuEntry[] = [];
  active = -1;
  /** The row whose submenu is open. */
  expanded: number | undefined;

  constructor(
    groups: readonly (readonly MenuEntry[])[],
    private readonly events: PanelEvents,
  ) {
    this.element.className = "lumiere-page-menu";
    this.element.setAttribute("role", "menu");
    groups
      .filter((group) => group.length > 0)
      .forEach((group, index) => {
        if (index > 0) {
          this.element.append(document.createElement("hr"));
        }
        group.forEach((entry) => this.add(entry));
      });
    // The menu never takes focus: the editor keeps its selection for Copy and Cut.
    this.element.addEventListener("mousedown", (event) =>
      event.preventDefault(),
    );
    document.body.append(this.element);
  }

  private add(entry: MenuEntry): void {
    const position = this.entries.length;
    const row = document.createElement("div");
    row.setAttribute("role", "menuitem");
    row.textContent = entry.label;
    if (!entry.enabled) {
      row.setAttribute("aria-disabled", "true");
    }
    if (isSubmenu(entry)) {
      row.setAttribute("aria-haspopup", "menu");
      row.setAttribute("aria-expanded", "false");
    }
    row.addEventListener("pointerenter", (event) =>
      this.events.hover(position, event.pointerType),
    );
    row.addEventListener("click", () => this.events.press(position));
    this.rows.push(row);
    this.entries.push(entry);
    this.element.append(row);
  }

  entry(position = this.active): MenuEntry | undefined {
    return this.entries[position];
  }

  row(position: number): HTMLElement | undefined {
    return this.rows[position];
  }

  highlight(position: number): void {
    this.active = position;
    this.rows.forEach((row, at) => {
      row.classList.toggle("active", at === position);
    });
  }

  move(step: 1 | -1): void {
    const next = nextEnabled(this.entries, this.active, step);
    if (next !== undefined) {
      this.highlight(next);
    }
  }

  expand(position: number | undefined): void {
    this.expanded = position;
    this.rows.forEach((row, at) => {
      if (row.hasAttribute("aria-expanded")) {
        row.setAttribute("aria-expanded", String(at === position));
      }
    });
  }
}

/** One open menu and its open submenus; a new right-click or any answer closes it. */
export class PageMenu {
  /** The page menu, then each open submenu, innermost last. */
  private readonly panels: MenuPanel[] = [];
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private isOpen = true;
  private readonly stop: () => void;

  constructor(
    private readonly request: MenuRequest,
    private readonly send: Send,
  ) {
    const root = this.open([...menuEntries(request.groups), editActions()]);
    placeAt(root.element, { x: request.x, y: request.y });
    this.stop = this.listen();
  }

  close(): void {
    this.answer(null);
  }

  private open(groups: readonly (readonly MenuEntry[])[]): MenuPanel {
    const depth = this.panels.length;
    const panel = new MenuPanel(groups, {
      hover: (position, pointerType) =>
        this.hover(depth, position, pointerType),
      press: (position) => this.press(depth, position),
    });
    this.panels.push(panel);
    return panel;
  }

  /** Closes the submenus opened from the menu at `depth`. */
  private closeAfter(depth: number): void {
    for (const panel of this.panels.splice(depth + 1)) {
      panel.element.remove();
    }
    this.panels[depth]?.expand(undefined);
  }

  private openSubmenu(depth: number, position: number): MenuPanel | undefined {
    const parent = this.panels[depth];
    const entry = parent?.entry(position);
    const row = parent?.row(position);
    if (!parent || !row || !isSubmenu(entry)) {
      return undefined;
    }
    this.closeAfter(depth);
    parent.highlight(position);
    parent.expand(position);
    const panel = this.open(entry.groups);
    placeBeside(panel.element, row, parent.element);
    return panel;
  }

  private hover(depth: number, position: number, pointerType: string): void {
    clearTimeout(this.hoverTimer);
    // The rows that lead to this submenu stay lit while the pointer is in it.
    this.panels.slice(0, depth).forEach((panel) => {
      panel.highlight(panel.expanded ?? -1);
    });
    this.panels[depth]?.highlight(position);
    // Only a mouse rests on a row. On a touch screen WebKit would spend the
    // first tap on what the hover opens, and the tap's click opens it anyway.
    if (pointerType === "mouse") {
      this.hoverTimer = setTimeout(
        () => this.rest(depth, position),
        HOVER_DELAY,
      );
    }
  }

  /** A mouse rested on a row: its submenu opens, and any other closes. */
  private rest(depth: number, position: number): void {
    if (this.panels[depth]?.expanded === position) {
      this.closeAfter(depth + 1);
      return;
    }
    this.closeAfter(depth);
    this.openSubmenu(depth, position);
  }

  private press(depth: number, position: number): void {
    clearTimeout(this.hoverTimer);
    const entry = this.panels[depth]?.entry(position);
    if (!entry?.enabled) {
      return;
    }
    if (!isSubmenu(entry)) {
      this.run(entry);
    } else if (this.panels[depth]?.expanded !== position) {
      // A click on an open submenu's row keeps it: the mouse resting on
      // the row may have opened it a moment before.
      this.openSubmenu(depth, position);
    }
  }

  private run(entry: CommandEntry): void {
    if (typeof entry.run === "number") {
      this.answer(entry.run);
    } else {
      this.answer(null);
      entry.run();
    }
  }

  private listen(): () => void {
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!this.panels.some((panel) => panel.element.contains(target))) {
        this.close();
      }
    };
    const keys = (event: KeyboardEvent) => this.key(event);
    const close = () => this.close();
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
    const depth = this.panels.length - 1;
    const entry = this.panels[depth]?.entry();
    const move = menuMove(event.key, {
      inSubmenu: depth > 0,
      row: entry && (isSubmenu(entry) ? "submenu" : "command"),
    });
    if (!move) {
      return;
    }
    clearTimeout(this.hoverTimer);
    this.follow(move, depth);
    // The editor does not see keys meant for the menu.
    event.preventDefault();
    event.stopPropagation();
  }

  private follow(move: MenuMove, depth: number): void {
    const panel = this.panels[depth];
    if (!panel) {
      return;
    }
    switch (move) {
      case "next":
      case "previous":
        return panel.move(move === "next" ? 1 : -1);
      case "open":
        return this.openSubmenu(depth, panel.active)?.move(1);
      case "choose":
        return this.press(depth, panel.active);
      case "back":
        return this.closeAfter(depth - 1);
      case "close":
        return this.close();
    }
  }

  private answer(value: number | null): void {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    clearTimeout(this.hoverTimer);
    this.stop();
    for (const panel of this.panels.splice(0)) {
      panel.element.remove();
    }
    this.send({
      ch: "ui",
      data: { type: "answer", id: this.request.id, value },
    });
  }
}

/** At the pointer, kept inside the page. */
function placeAt(element: HTMLElement, spot: { x: number; y: number }): void {
  const place = keepInside(spot, element.getBoundingClientRect(), page());
  element.style.left = `${place.x}px`;
  element.style.top = `${place.y}px`;
}

function placeBeside(
  element: HTMLElement,
  row: HTMLElement,
  menu: HTMLElement,
): void {
  const style = getComputedStyle(element);
  const place = submenuSpot({
    row: row.getBoundingClientRect(),
    menu: menu.getBoundingClientRect(),
    size: element.getBoundingClientRect(),
    page: page(),
    inset: parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth),
  });
  element.style.left = `${place.x}px`;
  element.style.top = `${place.y}px`;
}

function page(): { width: number; height: number } {
  return { width: innerWidth, height: innerHeight };
}

/** Cut, Copy and Paste, on the editor's own selection. */
function editActions(): CommandEntry[] {
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
