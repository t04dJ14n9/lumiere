import type { Plugin } from "@workshop/core";
import type { ActiveEditor, Dialogs } from "../../shared/host";
import type { Vault, Vaults } from "../vault/api";
import { pickTaggedNote } from "./search";
import {
  DISABLE_NESTED,
  ENABLE_NESTED,
  NESTED_CONTEXT,
  NESTED_SETTING,
  SEARCH_COMMAND,
  SORT_BY_FREQUENCY,
  SORT_BY_NAME,
  SORT_FREQUENCY_CONTEXT,
  SORT_SETTING,
  TagsTree,
  VIEW_ID,
} from "./tree";

/** Refreshes wait for a burst of file events to end. */
const REFRESH_DELAY_MS = 300;

type TagsViewCtx = Parameters<NonNullable<Plugin["apply"]>>[0];

function wireTagRefresh(
  ctx: TagsViewCtx,
  source: TagsTree,
  tree: ReturnType<TagsViewCtx["views"]["tree"]>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    const vault = await currentVault(ctx.activeEditor, ctx.vaults);
    const sort = ctx.settings.get<string>(SORT_SETTING, "frequency");
    source.update(vault?.index, {
      sort: sort === "name" ? "name" : "frequency",
      nested: ctx.settings.get<boolean>(NESTED_SETTING, true),
    });
    tree.setMessage(message(vault, source.isEmpty));
    tree.refresh();
  };
  const schedule = () => {
    clearTimeout(timer);
    if (tree.visible) {
      timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS);
    }
  };
  ctx.effect(() => () => clearTimeout(timer));
  ctx.effect(() => ctx.activeEditor.onNoteChanged(schedule));
  ctx.effect(() => ctx.settings.onChange(schedule));
  ctx.effect(() =>
    tree.onVisibilityChanged((visible) => visible && void refresh()),
  );
  ctx.on("vault/resolved", schedule);
  ctx.effect(() =>
    ctx.hostCommands.register(SEARCH_COMMAND, (root, tag) =>
      searchTag(ctx.dialogs, ctx.vaults, String(root), String(tag)),
    ),
  );
  return { refresh, schedule };
}

function wireTagViewMenus(ctx: TagsViewCtx, schedule: () => void) {
  const setSort = async (sort: "frequency" | "name") => {
    await ctx.settings.access.update(SORT_SETTING, sort);
    await syncTagViewContext(ctx);
    schedule();
  };
  const setNested = async (nested: boolean) => {
    await ctx.settings.access.update(NESTED_SETTING, nested);
    await syncTagViewContext(ctx);
    schedule();
  };
  ctx.effect(() =>
    ctx.hostCommands.register(SORT_BY_FREQUENCY, () => setSort("name")),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(SORT_BY_NAME, () => setSort("frequency")),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(ENABLE_NESTED, () => setNested(true)),
  );
  ctx.effect(() =>
    ctx.hostCommands.register(DISABLE_NESTED, () => setNested(false)),
  );
  const syncContext = () => {
    void syncTagViewContext(ctx).catch((error) =>
      ctx.logger.warn("Tags view context failed", error),
    );
  };
  ctx.effect(() => ctx.settings.onChange(syncContext));
  ctx.effect(() => async () => {
    await ctx.hostCommands.execute(
      "setContext",
      SORT_FREQUENCY_CONTEXT,
      undefined,
    );
    await ctx.hostCommands.execute("setContext", NESTED_CONTEXT, undefined);
  });
  syncContext();
}

/**
 * The window half of `tags`: the Explorer's Tags view for the active note's
 * vault (or the workspace's when no note is open). The editor half in
 * `host.ts` runs per panel; both follow the same enabled setting.
 */
export const tagsViewHost: Plugin = {
  name: "tags",
  inject: {
    required: [
      "settings",
      "vaults",
      "hostCommands",
      "views",
      "activeEditor",
      "dialogs",
    ],
  },
  apply(ctx) {
    const source = new TagsTree();
    const tree = ctx.views.tree(VIEW_ID, source);
    ctx.effect(() => () => tree.dispose());
    const { refresh, schedule } = wireTagRefresh(ctx, source, tree);
    wireTagViewMenus(ctx, schedule);
    void refresh();
  },
};

async function currentVault(
  activeEditor: ActiveEditor,
  vaults: Vaults,
): Promise<Vault | undefined> {
  const active = activeEditor.note();
  const located = active ? await vaults.locate(active) : undefined;
  return located?.vault ?? (await vaults.forWorkspace());
}

function message(vault: Vault | undefined, isEmpty: boolean) {
  if (!vault) {
    return "Open a note or a folder to see its tags.";
  }
  return isEmpty ? "No tags in this vault yet." : undefined;
}

/** Clicking a tag: choose a note that uses it, then open that note. */
async function searchTag(
  dialogs: Dialogs,
  vaults: Vaults,
  root: string,
  tag: string,
): Promise<void> {
  const vault = vaults.all().find((item) => item.index.root === root);
  const file = vault && (await pickTaggedNote(dialogs, vault.index, tag));
  if (file) {
    await vaults.open(file.uri);
  }
}

async function syncTagViewContext(ctx: {
  settings: { get(key: string, fallback: unknown): unknown };
  hostCommands: {
    execute(command: string, ...args: unknown[]): Promise<unknown>;
  };
}): Promise<void> {
  const frequency =
    ctx.settings.get<string>(SORT_SETTING, "frequency") === "frequency";
  const nested = ctx.settings.get<boolean>(NESTED_SETTING, true);
  await ctx.hostCommands.execute(
    "setContext",
    SORT_FREQUENCY_CONTEXT,
    frequency,
  );
  await ctx.hostCommands.execute("setContext", NESTED_CONTEXT, nested);
}
