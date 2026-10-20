import type { Plugin } from "@workshop/core";
import type {} from "../vault/api";
import { OPEN_COMMAND, OutgoingLinksTree, VIEW_ID } from "./tree";

const REFRESH_DELAY_MS = 300;

/** The Outgoing links view, following the active note. */
export const outgoingLinksHost: Plugin = {
  name: "outgoingLinks",
  inject: { required: ["vaults", "hostCommands", "views", "activeEditor"] },
  apply(ctx) {
    const source = new OutgoingLinksTree(ctx.vaults);
    const tree = ctx.views.tree(VIEW_ID, source);
    ctx.effect(() => () => tree.dispose());

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
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
    ctx.on("vault/resolved", schedule);
    ctx.effect(() =>
      ctx.hostCommands.register(OPEN_COMMAND, (uri, offset) =>
        ctx.vaults.open(
          String(uri),
          offset === undefined ? {} : { offset: Number(offset) },
        ),
      ),
    );
    void refresh();
  },
};
