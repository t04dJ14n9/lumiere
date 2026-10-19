import type { Plugin } from "@workshop/core";
import type { ActiveEditor, Dialogs } from "../../shared/host";
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

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const vault = await currentVault(ctx.activeEditor, ctx.vaults);
      source.update(vault?.index, {
        sort: ctx.settings.get("tags.viewSort", "frequency"),
        nested: ctx.settings.get("tags.viewNested", true),
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
