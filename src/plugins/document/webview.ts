import { collab } from "@codemirror/collab";
import { EditorView } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import { InputGroups } from "./input-groups";
import { Synchronizer } from "./sync";
import { protocol } from "./protocol";
export const documentWebview: Plugin<{ version: number; clientID: string }> = {
  name: "document",
  inject: { required: ["rpc"] },
  apply(ctx, config) {
    const groups = new InputGroups();
    let sync: Synchronizer | undefined;
    const queue: Parameters<Synchronizer["receive"]>[0][] = [];
    ctx.provide("document", {
      extension: [
        collab(config),
        groups.extension,
        EditorView.updateListener.of(() => queueMicrotask(() => sync?.pump())),
      ],
      attach(view) {
        groups.attach(view);
        sync = new Synchronizer(view, ctx.rpc, (message) => {
          view.dom.setAttribute("data-sync-status", message);
          ctx.emit("document/syncStatus", message);
        });
        for (const message of queue.splice(0)) sync.receive(message);
        return () => {
          groups.dispose();
          sync?.dispose();
          sync = undefined;
        };
      },
      pump() {
        sync?.pump();
      },
      flush() {
        return sync ? sync.flush() : Promise.reject(new Error("Editor not mounted"));
      },
      get error() {
        return sync?.error;
      },
    });
    ctx.effect(() =>
      ctx.rpc.on(protocol, "updates", (message) => {
        if (sync) sync.receive(message);
        else queue.push(message);
      }),
    );
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "flush", async () => {
        if (!sync) throw new Error("Editor not mounted");
        await sync.flush();
        return true;
      }),
    );
    ctx.effect(() => () => {
      groups.dispose();
      sync?.dispose();
    });
  },
};
