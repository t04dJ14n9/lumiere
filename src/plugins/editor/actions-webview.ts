import type { Context, Infer } from "../../kernel";
import type {} from "./api";
import { protocol, type action } from "./actions-protocol";
/** Contextual table/widget menus can show provider labels without receiving callbacks. */
export function registerActionMenus(ctx: Context): void {
  let actions: Infer<typeof action>[] = [];
  let live = true;
  let changed = false;
  ctx.effect(() => () => {
    live = false;
    actions = [];
  });
  ctx.effect(() =>
    ctx.rpc.on(protocol, "changed", (value) => {
      changed = true;
      actions = value;
    }),
  );
  void ctx.rpc
    .call(protocol, "current", {})
    .then((value) => {
      if (live && !changed) {
        actions = value;
      }
    })
    .catch((error) => {
      if (live) {
        ctx.logger.warn("Editor actions unavailable", error);
      }
    });
  ctx.on("editor/selectionMenu", (items) => [
    ...items,
    ...actions
      .filter((item) => item.scope === "selection")
      .map((item) => ({
        label: item.label,
        run: async () => {
          await ctx.rpc.call(protocol, "run", {
            owner: item.owner,
            id: item.id,
          });
        },
      })),
  ]);
}
