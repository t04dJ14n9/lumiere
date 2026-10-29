/**
 * The page's right-click menu apart from drawing it (page-menu.ts): its
 * entries, numbered as the host counts command rows; what a key does; and
 * where a menu goes. No DOM, so the tests reach it in Node.
 */
import type { MenuRow } from "../protocol";

/** A row that runs something: the host's row index, or a page action (Cut, Copy, Paste). */
export interface CommandEntry {
  readonly label: string;
  readonly enabled: boolean;
  readonly run: number | (() => void);
}

/** A row that opens a submenu of its own entries. */
export interface SubmenuEntry {
  readonly label: string;
  readonly enabled: true;
  readonly groups: readonly MenuEntry[][];
}

export type MenuEntry = CommandEntry | SubmenuEntry;

export function isSubmenu(entry: MenuEntry | undefined): entry is SubmenuEntry {
  return entry !== undefined && "groups" in entry;
}

/**
 * The host's rows as entries. A command row's number is its index in the
 * host's count (host/context-menu.ts, `menuCommands`): down the groups, and
 * into each submenu where it stands.
 */
export function menuEntries(groups: readonly MenuRow[][]): MenuEntry[][] {
  let next = 0;
  const entries = (rows: readonly MenuRow[][]): MenuEntry[][] =>
    rows.map((group) =>
      group.map((row): MenuEntry =>
        row.submenu
          ? { label: row.label, enabled: true, groups: entries(row.submenu) }
          : { label: row.label, enabled: true, run: next++ },
      ),
    );
  return entries(groups);
}

export type MenuMove =
  "next" | "previous" | "open" | "choose" | "back" | "close";

/** Where the keyboard is: in the innermost open menu, on its highlighted row. */
export interface MenuFocus {
  /** Whether the innermost open menu is a submenu. */
  readonly inSubmenu: boolean;
  readonly row: "command" | "submenu" | undefined;
}

/**
 * What a key does, as in VS Code's menus: Up and Down move through the
 * innermost menu; Right, or Enter, opens a submenu; Left or Escape goes back
 * out of one; Escape at the top closes the menu; Enter runs a command. Any
 * other key is the editor's.
 */
export function menuMove(key: string, focus: MenuFocus): MenuMove | undefined {
  switch (key) {
    case "ArrowDown":
      return "next";
    case "ArrowUp":
      return "previous";
    case "ArrowRight":
      return focus.row === "submenu" ? "open" : undefined;
    case "ArrowLeft":
      return focus.inSubmenu ? "back" : undefined;
    case "Enter":
      return enterMove(focus.row);
    case "Escape":
      return focus.inSubmenu ? "back" : "close";
    default:
      return undefined;
  }
}

function enterMove(row: MenuFocus["row"]): MenuMove | undefined {
  if (row === "submenu") {
    return "open";
  }
  return row === "command" ? "choose" : undefined;
}

/** The next enabled entry from `from` in the direction `step`, round the end. */
export function nextEnabled(
  entries: readonly MenuEntry[],
  from: number,
  step: 1 | -1,
): number | undefined {
  const count = entries.length;
  for (let tries = 0, next = from; tries < count; tries++) {
    next = (next + step + count) % count;
    if (entries[next]?.enabled) {
      return next;
    }
  }
  return undefined;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

const MARGIN = 4;

/** A menu of `size` at (x, y), moved back inside the page where it would leave it. */
export function keepInside(
  spot: { readonly x: number; readonly y: number },
  size: Size,
  page: Size,
): { readonly x: number; readonly y: number } {
  return {
    x: Math.max(MARGIN, Math.min(spot.x, page.width - size.width - MARGIN)),
    y: Math.max(MARGIN, Math.min(spot.y, page.height - size.height - MARGIN)),
  };
}

export interface SubmenuPlace {
  /** The submenu's row. */
  readonly row: Box;
  /** The menu that holds the row. */
  readonly menu: Box;
  /** The submenu's own size. */
  readonly size: Size;
  readonly page: Size;
  /** The submenu's padding and border above its first row. */
  readonly inset: number;
}

/**
 * Where a submenu opens: beside its menu, its first row level with its own
 * row; on the right, or on the left where the right has no room; and inside
 * the page either way, over its menu if it must.
 */
export function submenuSpot(place: SubmenuPlace): {
  readonly x: number;
  readonly y: number;
} {
  const { menu, size, page } = place;
  const right = menu.right + 2;
  const left = menu.left - size.width - 2;
  const fitsRight = right + size.width <= page.width - MARGIN;
  const x = fitsRight || left < MARGIN ? right : left;
  return keepInside({ x, y: place.row.top - place.inset }, size, page);
}
