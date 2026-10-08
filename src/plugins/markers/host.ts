import {
  bindCaller,
  type CallerBound,
  type Context,
  type Disposer,
  type Plugin,
} from "../../kernel";
import type {} from "../editor/api";
import type {} from "../document/api";
import type { Markers } from "./api";
import { MarkerStore } from "./store";
import { protocol } from "./protocol";
export const markersHost: Plugin = {
  name: "markers",
  inject: { required: ["editors"] },
  apply(ctx) {
    const store = new MarkerStore(
      () => ctx.editors.all(),
      (panel, value) => panel.rpc.notify(protocol, "changed", value),
    );
    ctx.effect(() => () => store.dispose());
    const service: Markers & CallerBound<Markers> = {
      ...store.service("markers"),
      [bindCaller](caller) {
        const owner = caller.fiber?.definition.name ?? "root";
        let live = true;
        caller.effect(() => () => {
          live = false;
          store.clearOwner(owner);
        });
        return store.service(owner, () => live);
      },
    };
    ctx.provide("markers", service);
    registerPanels(ctx, store);
    ctx.on("document/changed", (session, changes) =>
      store.changed(session.document, changes),
    );
  },
};
function registerPanels(ctx: Context, store: MarkerStore): void {
  const handlers = new Map<string, Disposer[]>();
  const register = (id: string) => {
    const panel = ctx.editors.all().find((panel) => panel.id === id);
    if (!panel || handlers.has(id)) {
      return;
    }
    store.observe(panel);
    handlers.set(id, [
      panel.rpc.handle(protocol, "current", () => store.snapshot(id)),
      panel.rpc.handle(protocol, "activate", (request) =>
        store.activate(id, request.owner, request.markerId),
      ),
    ]);
  };
  ctx.on("editor/opened", (panel) => register(panel.id));
  ctx.on("editor/ready", (panel) => store.send(panel.id));
  ctx.on("editor/closed", (panel) => {
    for (const stop of handlers.get(panel.id) ?? []) {
      void stop();
    }
    handlers.delete(panel.id);
    store.closed(panel.id);
  });
  ctx.effect(() => () => {
    for (const stops of handlers.values()) {
      for (const stop of stops) {
        void stop();
      }
    }
    handlers.clear();
  });
  for (const panel of ctx.editors.all()) {
    register(panel.id);
  }
}
