import type { Plugin } from "../../kernel";
import type { HostViews } from "../../shared/runtime";
import type { Vault, Vaults } from "../vault/api";
import { pickTaggedNote } from "./search";
import { SEARCH_COMMAND, TagsTree, VIEW_ID } from "./tree";

/** Refreshes wait for a burst of file events to end. */
const REFRESH_DELAY_MS = 300;

/**
 * The window half of `tags`: the Explorer's Tags view for the active note's
 * vault (or the workspace's when no note is open). The editor half in
 * `host.ts` runs per panel; both follow the same enabled setting.
 */
export const tagsViewHost: Plugin = {
  name: "tags",
  inject: { required: ["workbench", "vaults"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views) {
      return;
    }
    const source = new TagsTree();
    const tree = views.tree(VIEW_ID, source);
    ctx.effect(() => () => tree.dispose());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const vault = await currentVault(views, ctx.vaults);
      source.update(vault?.index, {
        sort: views.setting("tags.viewSort", "name"),
        nested: views.setting("tags.viewNested", true),
      });
      tree.setMessage(message(vault, source.isEmpty));
      tree.refresh();
    };
    // A hidden view is rebuilt when it is shown again, not on every change.
    const schedule = () => {
      clearTimeout(timer);
      if (tree.visible) {
        timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS);
      }
    };
    ctx.effect(() => () => clearTimeout(timer));
    ctx.effect(() => views.onActiveNoteChanged(schedule));
    if (ctx.workbench.onConfiguration) {
      ctx.effect(() => ctx.workbench.onConfiguration!(schedule));
    }
    ctx.effect(() =>
      tree.onVisibilityChanged((visible) => visible && void refresh()),
    );
    ctx.on("vault/resolved", schedule);
    ctx.effect(() =>
      views.command(SEARCH_COMMAND, (root, tag) =>
        searchTag(views, ctx.vaults, String(root), String(tag)),
      ),
    );
    void refresh();
  },
};

async function currentVault(
  views: HostViews,
  vaults: Vaults,
): Promise<Vault | undefined> {
  const active = views.activeNote();
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
  views: HostViews,
  vaults: Vaults,
  root: string,
  tag: string,
): Promise<void> {
  const vault = vaults.all().find((item) => item.index.root === root);
  const file = vault && (await pickTaggedNote(views, vault.index, tag));
  if (file) {
    await vaults.open(file.uri);
  }
}
