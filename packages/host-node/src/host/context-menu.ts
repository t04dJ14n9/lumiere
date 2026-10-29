/**
 * The editor's right-click menu outside VS Code. VS Code draws a webview's
 * context menu from the extension's `webview/context` contributions, showing
 * those whose when-clause holds for the clicked element's context and the
 * context keys the plugins set, and a submenu (`contributes.submenus`) as a
 * row that opens its own items. Here the page reports the right-click
 * (protocol.ts, `contextmenu`), the host picks the items the same way and
 * asks the page to draw them, and runs the chosen one's command with the
 * argument VS Code passes: the webview and the element's context.
 */
import type { HostCommands } from "@workshop/markdown/portable";
import type { MenuContext, MenuRow, UiEvent } from "../protocol";
import { questionId, type LivePanel } from "./panel";
import type { PanelHub } from "./panels";
import { evaluateWhen } from "./when";

/** One item of the `webview/context` menu or of a submenu, with its command's titles (assets.mjs writes them). */
export interface MenuCommand {
  readonly command: string;
  readonly title: string;
  /** The command's `shortTitle`: its label inside a submenu, Bold under Format. */
  readonly shortTitle?: string;
  /** `name@order`, as in package.json. */
  readonly group?: string;
  readonly when?: string;
}

/** A submenu (VS Code's `contributes.submenus`): its label and its own items. */
export interface MenuSubmenu {
  readonly submenu: string;
  readonly title: string;
  readonly group?: string;
  readonly when?: string;
  readonly items: readonly MenuContribution[];
}

export type MenuContribution = MenuCommand | MenuSubmenu;

/** A submenu that shows, with its items that show, grouped. */
export interface ShownSubmenu extends MenuSubmenu {
  readonly groups: ShownItem[][];
}

export type ShownItem = MenuCommand | ShownSubmenu;

/** The context keys the plugins set with `setContext`, as VS Code keeps them. */
export class ContextKeys {
  private readonly values = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }

  get(key: string): unknown {
    return this.values.get(key);
  }
}

/**
 * The items whose clause holds, grouped as VS Code groups them: `navigation`
 * first, then the groups by name, each item by its `@order`. A submenu shows
 * only with an item to show, as VS Code hides an empty one.
 */
export function menuGroups(
  contributions: readonly MenuContribution[],
  lookup: (key: string) => unknown,
): ShownItem[][] {
  const groups = new Map<string, ShownItem[]>();
  for (const item of contributions) {
    const shown = shownItem(item, lookup);
    if (shown) {
      const name = groupName(item);
      groups.set(name, [...(groups.get(name) ?? []), shown]);
    }
  }
  return [...groups]
    .sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
    .map(([, items]) => [...items].sort((a, b) => order(a) - order(b)));
}

function shownItem(
  item: MenuContribution,
  lookup: (key: string) => unknown,
): ShownItem | undefined {
  if (!evaluateWhen(item.when, lookup)) {
    return undefined;
  }
  if (!("submenu" in item)) {
    return item;
  }
  const groups = menuGroups(item.items, lookup);
  return groups.length > 0 ? { ...item, groups } : undefined;
}

/**
 * The rows the page draws. Inside a submenu a command shows its short
 * title, where the submenu's label says the rest: Format, then Bold.
 */
export function menuRows(groups: readonly ShownItem[][]): MenuRow[][] {
  return rowsOf(groups, (item) => item.title);
}

function rowsOf(
  groups: readonly ShownItem[][],
  label: (item: MenuCommand) => string,
): MenuRow[][] {
  return groups.map((group) =>
    group.map((item) =>
      "submenu" in item
        ? { label: item.title, submenu: rowsOf(item.groups, shortLabel) }
        : { label: label(item) },
    ),
  );
}

function shortLabel(item: MenuCommand): string {
  return item.shortTitle ?? item.title;
}

/**
 * The command rows in the order the page counts them for its answer: down
 * the groups, and into each submenu where it stands.
 */
export function menuCommands(groups: readonly ShownItem[][]): MenuCommand[] {
  return groups
    .flat()
    .flatMap((item) =>
      "submenu" in item ? menuCommands(item.groups) : [item],
    );
}

function groupRank(name: string): number {
  return name === "navigation" ? 0 : 1;
}

function groupName(item: MenuContribution): string {
  return (item.group ?? "").split("@")[0] ?? "";
}

function order(item: ShownItem): number {
  return Number((item.group ?? "").split("@")[1] ?? 0) || 0;
}

export interface ContextMenuOptions {
  readonly panels: PanelHub;
  readonly contributions: readonly MenuContribution[];
  readonly keys: ContextKeys;
  readonly commands: Pick<HostCommands, "execute">;
  /** The editor's view type: VS Code's `activeCustomEditorId`, `webview` and `webviewId`. */
  readonly viewType: string;
  readonly log: (message: string) => void;
}

/**
 * The items of a `menus.json` (written at build time), submenus with their
 * own items; anything else is dropped, as are submenus nested too deep.
 */
export function parseMenus(value: unknown): readonly MenuContribution[] {
  return parseItems(value, 0);
}

const MAX_SUBMENU_DEPTH = 4;

function parseItems(value: unknown, depth: number): MenuContribution[] {
  if (!Array.isArray(value) || depth > MAX_SUBMENU_DEPTH) {
    return [];
  }
  return value.flatMap((item: unknown) => {
    const parsed = parseItem(item, depth);
    return parsed ? [parsed] : [];
  });
}

function parseItem(item: unknown, depth: number): MenuContribution | undefined {
  if (!isRecord(item) || typeof item.title !== "string") {
    return undefined;
  }
  const shared = {
    title: item.title,
    ...stringField(item, "group"),
    ...stringField(item, "when"),
  };
  if (typeof item.command === "string") {
    return {
      command: item.command,
      ...shared,
      ...stringField(item, "shortTitle"),
    };
  }
  if (typeof item.submenu === "string") {
    return {
      submenu: item.submenu,
      ...shared,
      items: parseItems(item.items, depth + 1),
    };
  }
  return undefined;
}

function stringField<K extends string>(
  item: Record<string, unknown>,
  key: K,
): Partial<Record<K, string>> {
  const value = item[key];
  return typeof value === "string"
    ? ({ [key]: value } as Record<K, string>)
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Answer every page's right-clicks; returns the way to stop. */
export function registerContextMenus(options: ContextMenuOptions): () => void {
  const listening = new Map<LivePanel, () => void>();
  const stopOpened = options.panels.onOpened((panel) => {
    listening.set(
      panel,
      panel.onUi((event) => {
        if (event.type === "contextmenu") {
          void showMenu(panel, event, options);
        }
      }),
    );
    panel.shell.onDispose(() => {
      listening.get(panel)?.();
      listening.delete(panel);
    });
  });
  return () => {
    stopOpened();
    for (const stop of listening.values()) {
      stop();
    }
    listening.clear();
  };
}

/** Never rejects: a failed command is logged. */
async function showMenu(
  panel: LivePanel,
  event: Extract<UiEvent, { type: "contextmenu" }>,
  options: ContextMenuOptions,
): Promise<void> {
  const { context } = event;
  const groups = menuGroups(options.contributions, (key) =>
    lookupKey(key, context, options),
  );
  const answer = await panel.ask({
    type: "menu",
    id: questionId(),
    x: event.x,
    y: event.y,
    groups: menuRows(groups),
  });
  // Only an item offered here runs: the page names a row, not a command.
  const chosen =
    typeof answer === "number" ? menuCommands(groups)[answer] : undefined;
  if (!chosen) {
    return;
  }
  try {
    await options.commands.execute(chosen.command, {
      webview: options.viewType,
      ...context,
    });
  } catch (error) {
    options.log(`${chosen.title} failed: ${String(error)}`);
  }
}

/**
 * The keys VS Code sets to a webview editor's view type. Menus may use any
 * of them; `webviewId` is the one VS Code documents for `webview/context`.
 */
const EDITOR_KEYS: ReadonlySet<string> = new Set([
  "activeCustomEditorId",
  "webview",
  "webviewId",
]);

/** The element's context first, then what VS Code knows about the editor, then the plugins' keys. */
function lookupKey(
  key: string,
  context: MenuContext,
  options: ContextMenuOptions,
): unknown {
  if (key in context) {
    return context[key];
  }
  if (EDITOR_KEYS.has(key)) {
    return options.viewType;
  }
  return options.keys.get(key);
}
