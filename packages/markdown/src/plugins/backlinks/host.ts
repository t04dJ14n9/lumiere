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

/** The Backlinks view and status bar count, following the active note. */
export const backlinksHost: Plugin = {
  name: "backlinks",
  inject: {
    required: ["settings", "vaults", "hostCommands", "views", "activeEditor"],
  },
  apply(ctx) {
    const sortOrder = (): BacklinkSortOrder =>
      parseSortOrder(ctx.settings.get(SORT_SETTING, "alphabetical"));
    const source = new BacklinksTree(ctx.vaults, sortOrder);
    const tree = ctx.views.tree(VIEW_ID, source);
    const status = ctx.views.status("lumiere.markdown.backlinks", 100);
    ctx.effect(() => () => tree.dispose());
    ctx.effect(() => () => status.dispose());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
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
    ctx.effect(() => ctx.settings.onChange(schedule));
    ctx.on("vault/resolved", schedule);
    ctx.effect(() =>
      ctx.hostCommands.register(OPEN_COMMAND, (uri, offset) =>
        ctx.vaults.open(String(uri), { offset: Number(offset) }),
      ),
    );

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
    const syncContext = () => {
      void syncBacklinksSortContext(ctx).catch((error) =>
        ctx.logger.warn("Backlinks sort context failed", error),
      );
    };
    ctx.effect(() => ctx.settings.onChange(syncContext));
    ctx.effect(() => async () => {
      for (const key of [
        SORT_ALPHABETICAL_CONTEXT,
        SORT_ALPHABETICAL_REVERSE_CONTEXT,
        SORT_MODIFIED_CONTEXT,
        SORT_MODIFIED_REVERSE_CONTEXT,
      ]) {
        await ctx.hostCommands.execute("setContext", key, undefined);
      }
    });
    syncContext();
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
