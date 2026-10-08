import type { Plugin } from "../../kernel";
import type {} from "../vault/api";
import { BacklinksTree, OPEN_COMMAND } from "./tree";

/** Refreshes wait for a burst of file events to end. */
const REFRESH_DELAY_MS = 300;

/** The Backlinks view and status bar count, following the active note. */
export const backlinksHost: Plugin = {
  name: "backlinks",
  inject: { required: ["workbench", "vaults"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views) {
      return;
    }
    const source = new BacklinksTree(ctx.vaults);
    const tree = views.tree("markdownWorkbench.backlinks", source);
    const status = views.status("markdownWorkbench.backlinks", 100);
    ctx.effect(() => () => tree.dispose());
    ctx.effect(() => () => status.dispose());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      await source.setNote(views.activeNote());
      tree.setMessage(
        source.hasNote ? undefined : "Open a note to see its backlinks.",
      );
      tree.refresh();
      const count = source.linkedCount();
      if (source.hasNote) {
        status.show(
          `${count} backlink${count === 1 ? "" : "s"}`,
          "Notes that link to this note",
          "markdownWorkbench.backlinks.focus",
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
    ctx.effect(() => views.onActiveNoteChanged(schedule));
    ctx.on("vault/resolved", schedule);
    ctx.effect(() =>
      views.command(OPEN_COMMAND, (uri, offset) =>
        ctx.vaults.open(String(uri), { offset: Number(offset) }),
      ),
    );
    void refresh();
  },
};
