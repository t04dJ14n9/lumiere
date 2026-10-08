import {
  bindCaller,
  type CallerBound,
  type Context,
  type Disposer,
} from "../../kernel";
import type { Editors, Selections } from "./api";
import type { EditorActions } from "./actions-api";
import { ActionRegistry } from "./actions";
import { protocol } from "./actions-protocol";
import { RpcError } from "../../shared/rpc/lifecycle";
export function registerEditorActions(
  ctx: Context,
  editors: Editors,
  selections: Selections,
): void {
  const publish = () => publishActions(ctx, editors, registry);
  const registry = new ActionRegistry(
    editors,
    selections,
    ctx.workbench,
    publish,
  );
  const service: EditorActions & CallerBound<EditorActions> = {
    register: (action) => registry.register("editor", action),
    [bindCaller](caller) {
      const owner = caller.fiber?.definition.name ?? "root";
      let live = true;
      caller.effect(() => () => {
        live = false;
        registry.clearOwner(owner);
      });
      return {
        register(action) {
          if (!live) {
            throw new RpcError("PluginDisabled", "Action provider stopped");
          }
          return registry.register(owner, action);
        },
      };
    },
  };
  ctx.provide("editorActions", service);
  registerActionPanels(ctx, editors, registry);
  for (const scope of ["title", "selection"] as const) {
    ctx.effect(() =>
      ctx.workbench.command(`markdownWorkbench.${scope}Actions`, () =>
        registry.pick(scope),
      ),
    );
  }
  ctx.effect(() => () => {
    registry.dispose();
    publish();
  });
  if (ctx.workbench.onConfiguration) {
    ctx.effect(() => ctx.workbench.onConfiguration!(publish));
  }
  ctx.on("editor/activeChanged", publish);
  publish();
}
function registerActionPanels(
  ctx: Context,
  editors: Editors,
  registry: ActionRegistry,
): void {
  const handlers = new Map<string, Disposer[]>();
  const register = (id: string) => {
    const panel = editors.all().find((panel) => panel.id === id);
    if (!panel || handlers.has(id)) {
      return;
    }
    handlers.set(id, [
      panel.rpc.handle(protocol, "current", () => registry.list(id)),
      panel.rpc.handle(protocol, "run", (value, token) =>
        registry.run(id, value.owner, value.id, token),
      ),
    ]);
  };
  ctx.on("editor/opened", (panel) => register(panel.id));
  ctx.on("editor/closed", (panel) => {
    for (const stop of handlers.get(panel.id) ?? []) {
      void stop();
    }
    handlers.delete(panel.id);
  });
  ctx.effect(() => () => {
    for (const stops of handlers.values()) {
      for (const stop of stops) {
        void stop();
      }
    }
    handlers.clear();
  });
  for (const panel of editors.all()) {
    register(panel.id);
  }
}

function publishActions(
  ctx: Context,
  editors: Editors,
  registry: ActionRegistry,
): void {
  const values = registry.list(editors.active()?.id);
  for (const panel of editors.all()) {
    panel.rpc.notify(protocol, "changed", registry.list(panel.id));
  }
  for (const scope of ["selection", "title"] as const) {
    void ctx.workbench.execute(
      "setContext",
      `markdownWorkbench.has${scope === "title" ? "Title" : "Selection"}Actions`,
      values.some((value) => value.scope === scope),
    );
  }
}
