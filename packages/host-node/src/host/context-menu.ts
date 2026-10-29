/**
 * The editor's right-click menu outside VS Code. VS Code draws a webview's
 * context menu from the extension's `webview/context` contributions, showing
 * those whose when-clause holds for the clicked element's context and the
 * context keys the plugins set. Here the page reports the right-click
 * (protocol.ts, `contextmenu`), the host picks the items the same way and
 * asks the page to draw them, and runs the chosen one's command with the
 * argument VS Code passes: the webview and the element's context.
 */
import type { HostCommands } from "@workshop/markdown/portable";
import type { MenuContext, UiEvent } from "../protocol";
import { questionId, type LivePanel } from "./panel";
import type { PanelHub } from "./panels";
import { evaluateWhen } from "./when";

/** One `webview/context` menu item, with its command's title (assets.mjs writes them). */
export interface MenuContribution {
  readonly command: string;
  readonly title: string;
  /** `name@order`, as in package.json. */
  readonly group?: string;
  readonly when?: string;
}

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
 * first, then the groups by name, each item by its `@order`.
 */
export function menuGroups(
  contributions: readonly MenuContribution[],
  lookup: (key: string) => unknown,
): MenuContribution[][] {
  const groups = new Map<string, MenuContribution[]>();
  for (const item of contributions) {
    if (evaluateWhen(item.when, lookup)) {
      const name = groupName(item);
      groups.set(name, [...(groups.get(name) ?? []), item]);
    }
  }
  return [...groups]
    .sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
    .map(([, items]) => [...items].sort((a, b) => order(a) - order(b)));
}

function groupRank(name: string): number {
  return name === "navigation" ? 0 : 1;
}

function groupName(item: MenuContribution): string {
  return (item.group ?? "").split("@")[0] ?? "";
}

function order(item: MenuContribution): number {
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

/** The items of a `menus.json` (written at build time); anything else is dropped. */
export function parseMenus(value: unknown): readonly MenuContribution[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is MenuContribution =>
          typeof item?.command === "string" && typeof item?.title === "string",
      )
    : [];
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
  const items = groups.flat();
  const answer = await panel.ask({
    type: "menu",
    id: questionId(),
    x: event.x,
    y: event.y,
    groups: groups.map((group) => group.map((item) => ({ label: item.title }))),
  });
  // Only an item offered here runs: the page names a row, not a command.
  const chosen = typeof answer === "number" ? items[answer] : undefined;
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
