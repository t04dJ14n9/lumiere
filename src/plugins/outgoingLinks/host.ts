import type { Plugin } from "../../kernel";
import type {} from "../vault/api";
import { OPEN_COMMAND, OutgoingLinksTree } from "./tree";

const REFRESH_DELAY_MS = 300;

/** The Outgoing links view, following the active note. */
export const outgoingLinksHost: Plugin = {
  name: "outgoingLinks",
  inject: { required: ["workbench", "vaults"] },
  apply(ctx) {
    const views = ctx.workbench.views;
    if (!views) {
      return;
    }
    const source = new OutgoingLinksTree(ctx.vaults);
    const tree = views.tree("markdownWorkbench.outgoingLinks", source);
    ctx.effect(() => () => tree.dispose());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      await source.setNote(views.activeNote());
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
    ctx.effect(() => views.onActiveNoteChanged(schedule));
    ctx.on("vault/resolved", schedule);
    ctx.effect(() =>
      views.command(OPEN_COMMAND, (uri) => ctx.vaults.open(String(uri))),
    );
    void refresh();
  },
};
