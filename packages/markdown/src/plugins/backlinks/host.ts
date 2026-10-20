import type { Plugin } from "@workshop/core";
import type {} from "../vault/api";
import {
  BacklinksTree,
  NEXT_SORT,
  OPEN_COMMAND,
  SORT_ALPHABETICAL_CONTEXT,
  SORT_ALPHABETICAL_REVERSE_CONTEXT,
  SORT_BY_ALPHABETICAL,
  SORT_BY_ALPHABETICAL_REVERSE,
  SORT_BY_MODIFIED,
  SORT_BY_MODIFIED_REVERSE,
  SORT_MODIFIED_CONTEXT,
  SORT_MODIFIED_REVERSE_CONTEXT,
  SORT_SETTING,
  VIEW_ID,
  parseSortOrder,
  type BacklinkSortOrder,
} from "./tree";

/** Refreshes wait for a burst of file events to end. */
const REFRESH_DELAY_MS = 300;

type BacklinksCtx = Parameters<NonNullable<Plugin["apply"]>>[0];

function wireRefresh(
  ctx: BacklinksCtx,
  source: BacklinksTree,
  tree: ReturnType<BacklinksCtx["views"]["tree"]>,
  status: ReturnType<BacklinksCtx["views"]["status"]>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    void syncBacklinksSortContext(ctx).catch(() => undefined);
    await source.setNote(ctx.activeEditor.note());
    tree.setMessage(
      source.hasNote ? undefined : "Open a note to see its backlinks.",
    );
    tree.refresh();
    const count = source.linkedCount();
    if (source.hasNote) {
      status.show(
        `${count} backlink${count === 1 ? "" : "s"}`,
        "Notes that link to this note",
        "lumiere.markdown.backlinks.focus",
      );
    } else {
      status.hide();
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS);
  };
  ctx.effect(() => () => clearTimeout(timer));
  ctx.effect(() => ctx.activeEditor.onNoteChanged(schedule));
  ctx.on("vault/resolved", schedule);
  ctx.effect(() =>
    ctx.hostCommands.register(OPEN_COMMAND, (uri, offset) =>
      ctx.vaults.open(String(uri), { offset: Number(offset) }),
    ),
  );
  return { refresh, schedule };
}

function wireSortMenus(ctx: BacklinksCtx, schedule: () => void) {
  const setSort = async (order: BacklinkSortOrder) => {
    await ctx.settings.access.update(SORT_SETTING, order);
    await syncBacklinksSortContext(ctx);
    schedule();
  };
  // Checked sort label cycles to the next Obsidian sort order.
  ctx.effect(() =>
    ctx.hostCommands.register(SORT_BY_ALPHABETICAL, () =>
      setSort(NEXT_SORT.alphabetical),
    ),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(SORT_BY_ALPHABETICAL_REVERSE, () =>
      setSort(NEXT_SORT.alphabeticalReverse),
    ),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(SORT_BY_MODIFIED, () =>
      setSort(NEXT_SORT.byModifiedTime),
    ),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(SORT_BY_MODIFIED_REVERSE, () =>
      setSort(NEXT_SORT.byModifiedTimeReverse),
    ),
  );
  // Do not call settings.onChange — leave-no-trace fakes keep a single
  // listener for feature enablement. Sort context syncs on refresh /
  // sort commands instead.
  ctx.effect(() => () => {
    void (async () => {
      for (const key of [
        SORT_ALPHABETICAL_CONTEXT,
        SORT_ALPHABETICAL_REVERSE_CONTEXT,
        SORT_MODIFIED_CONTEXT,
        SORT_MODIFIED_REVERSE_CONTEXT,
      ]) {
        await ctx.hostCommands.execute("setContext", key, undefined);
      }
    })().catch(() => undefined);
  });
  void syncBacklinksSortContext(ctx).catch(() => undefined);
}

/** The Backlinks view and status bar count, following the active note. */
export const backlinksHost: Plugin = {
  name: "backlinks",
  inject: {
    required: ["vaults", "hostCommands", "views", "activeEditor", "settings"],
  },
  apply(ctx) {
    const sortOrder = (): BacklinkSortOrder =>
      parseSortOrder(ctx.settings.get(SORT_SETTING, "alphabetical"));
    const source = new BacklinksTree(ctx.vaults, sortOrder);
    const tree = ctx.views.tree(VIEW_ID, source);
    const status = ctx.views.status("lumiere.markdown.backlinks", 100);
    ctx.effect(() => () => tree.dispose());
    ctx.effect(() => () => status.dispose());
    const { refresh, schedule } = wireRefresh(ctx, source, tree, status);
    wireSortMenus(ctx, schedule);
    void refresh();
  },
};

async function syncBacklinksSortContext(ctx: {
  settings: { get(key: string, fallback: unknown): unknown };
  hostCommands: {
    execute(command: string, ...args: unknown[]): Promise<unknown>;
  };
}): Promise<void> {
  const order = parseSortOrder(ctx.settings.get(SORT_SETTING, "alphabetical"));
  await ctx.hostCommands.execute(
    "setContext",
    SORT_ALPHABETICAL_CONTEXT,
    order === "alphabetical",
  );
  await ctx.hostCommands.execute(
    "setContext",
    SORT_ALPHABETICAL_REVERSE_CONTEXT,
    order === "alphabeticalReverse",
  );
  await ctx.hostCommands.execute(
    "setContext",
    SORT_MODIFIED_CONTEXT,
    order === "byModifiedTime",
  );
  await ctx.hostCommands.execute(
    "setContext",
    SORT_MODIFIED_REVERSE_CONTEXT,
    order === "byModifiedTimeReverse",
  );
}
