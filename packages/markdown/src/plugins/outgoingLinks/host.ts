import type { Plugin } from "@workshop/core";
import type {} from "../vault/api";
import type { HostSettings } from "../../shared/host";
import {
  CREATE_COMMAND,
  DISABLE_EXTRA_CONTEXT,
  ENABLE_EXTRA_CONTEXT,
  EXTRA_CONTEXT_CONTEXT,
  EXTRA_CONTEXT_SETTING,
  NEXT_SORT,
  OPEN_COMMAND,
  OutgoingLinksTree,
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
  type OutgoingSortOrder,
} from "./tree";

const REFRESH_DELAY_MS = 300;

function wantsExtraContext(settings: HostSettings): boolean {
  return settings.get<boolean>(EXTRA_CONTEXT_SETTING, false);
}

type OutgoingCtx = Parameters<NonNullable<Plugin["apply"]>>[0];

function wireRefresh(
  ctx: OutgoingCtx,
  source: OutgoingLinksTree,
  tree: ReturnType<OutgoingCtx["views"]["tree"]>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    void syncOutgoingSortContext(ctx).catch(() => undefined);
    void Promise.resolve(
      ctx.hostCommands.execute(
        "setContext",
        EXTRA_CONTEXT_CONTEXT,
        wantsExtraContext(ctx.settings),
      ) as unknown,
    ).catch(() => undefined);
    await source.setNote(ctx.activeEditor.note());
    tree.setMessage(
      source.hasNote ? undefined : "Open a note to see its outgoing links.",
    );
    tree.refresh();
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS);
  };
  ctx.effect(() => () => clearTimeout(timer));
  ctx.effect(() => ctx.activeEditor.onNoteChanged(schedule));
  ctx.effect(() => ctx.on("vault/resolved", schedule));
  ctx.effect(() =>
    ctx.hostCommands.register(OPEN_COMMAND, (uri, offset) =>
      ctx.vaults.open(
        String(uri),
        offset === undefined ? {} : { offset: Number(offset) },
      ),
    ),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(CREATE_COMMAND, async (sourceUri, linkpath) => {
      const located = await ctx.vaults.locate(String(sourceUri));
      if (!located) {
        return;
      }
      const uri = await ctx.navigation.resolve({
        root: located.vault.index.root,
        source: String(sourceUri),
        path: String(linkpath),
        create: true,
        folderNote: "",
      });
      if (uri) {
        await ctx.vaults.open(uri);
      }
    }),
  );
  return { refresh, schedule };
}

function wireSortMenus(ctx: OutgoingCtx, schedule: () => void) {
  const setSort = async (order: OutgoingSortOrder) => {
    await ctx.settings.access.update(SORT_SETTING, order);
    await syncOutgoingSortContext(ctx);
    schedule();
  };
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
  void syncOutgoingSortContext(ctx).catch(() => undefined);
}

function seedExtraContext(ctx: OutgoingCtx): void {
  void Promise.resolve(
    ctx.hostCommands.execute(
      "setContext",
      EXTRA_CONTEXT_CONTEXT,
      wantsExtraContext(ctx.settings),
    ) as unknown,
  ).catch(() => undefined);
}

function clearExtraContext(ctx: OutgoingCtx): void {
  try {
    const done = ctx.hostCommands.execute(
      "setContext",
      EXTRA_CONTEXT_CONTEXT,
      undefined,
    ) as unknown;
    if (done && typeof (done as Promise<void>).then === "function") {
      void Promise.resolve(done).catch(() => undefined);
    }
  } catch {
    // ignore teardown races
  }
}

function wireExtraContext(ctx: OutgoingCtx, refresh: () => Promise<void>) {
  const setExtraContext = async (enabled: boolean) => {
    await ctx.settings.access.update(EXTRA_CONTEXT_SETTING, enabled);
    await ctx.hostCommands.execute(
      "setContext",
      EXTRA_CONTEXT_CONTEXT,
      enabled,
    );
    await refresh();
  };
  ctx.effect(() =>
    ctx.hostCommands.register(ENABLE_EXTRA_CONTEXT, () =>
      setExtraContext(true),
    ),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(DISABLE_EXTRA_CONTEXT, () =>
      setExtraContext(false),
    ),
  );
  // Do not call settings.onChange here — leave-no-trace fakes keep a
  // single listener for feature enablement. Context syncs on refresh /
  // enable-disable commands instead.
  seedExtraContext(ctx);
  ctx.effect(() => () => clearExtraContext(ctx));
}

/** The Outgoing Links view, following the active note. */
export const outgoingLinksHost: Plugin = {
  name: "outgoingLinks",
  inject: {
    required: [
      "vaults",
      "hostCommands",
      "views",
      "activeEditor",
      "settings",
      "navigation",
    ],
  },
  apply(ctx) {
    const sortOrder = (): OutgoingSortOrder =>
      parseSortOrder(ctx.settings.get(SORT_SETTING, "alphabetical"));
    const source = new OutgoingLinksTree(ctx.vaults, sortOrder, () =>
      wantsExtraContext(ctx.settings),
    );
    const tree = ctx.views.tree(VIEW_ID, source);
    ctx.effect(() => () => tree.dispose());
    const { refresh, schedule } = wireRefresh(ctx, source, tree);
    wireSortMenus(ctx, schedule);
    wireExtraContext(ctx, refresh);
    void refresh();
  },
};

async function syncOutgoingSortContext(ctx: {
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
