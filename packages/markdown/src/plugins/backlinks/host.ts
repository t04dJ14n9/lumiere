import type { Plugin } from "@workshop/core";
import type {} from "../vault/api";
import { BacklinksTree, OPEN_COMMAND, VIEW_ID } from "./tree";

/** Refreshes wait for a burst of file events to end. */
const REFRESH_DELAY_MS = 300;

/** The Backlinks view and status bar count, following the active note. */
export const backlinksHost: Plugin = {
  name: "backlinks",
  inject: { required: ["vaults", "hostCommands", "views", "activeEditor"] },
  apply(ctx) {
    const source = new BacklinksTree(ctx.vaults);
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
    ctx.on("vault/resolved", schedule);
    ctx.effect(() =>
      ctx.hostCommands.register(OPEN_COMMAND, (uri, offset) =>
        ctx.vaults.open(String(uri), { offset: Number(offset) }),
      ),
    );
    void refresh();
  },
};
