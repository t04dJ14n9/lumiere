import type { Context, Fiber } from "../../kernel";
import type { Manifest } from "../../shared/manifest";
import type {} from "../editor/api";
import { protocol } from "./protocol";

/** Static contribution visibility and runtime command ownership agree per active panel. */
export function featureCommands(
  ctx: Context,
  manifests: readonly Manifest[],
): void {
  const fibers = new Map<string, Fiber>();
  let queue = Promise.resolve();
  let live = true;
  ctx.effect(() => () => {
    live = false;
  });
  const refresh = () => {
    queue = queue
      .then(async () => {
        if (!live) {
          return;
        }
        const panel = ctx.editors.active();
        const settings = panel
          ? ctx.workbench.config(panel.document)
          : undefined;
        for (const manifest of manifests) {
          const enabled = Boolean(
            panel &&
              settings?.preset === "obsidian" &&
              (settings.features?.[manifest.id]?.enabled ??
                manifest.defaultEnabled),
          );
          const previous = fibers.get(manifest.id);
          if (!enabled && previous) {
            await previous.dispose();
            fibers.delete(manifest.id);
          }
          if (!enabled || fibers.has(manifest.id)) {
            continue;
          }
          fibers.set(
            manifest.id,
            ctx.plugin({
              name: `commands:${manifest.id}`,
              apply(owned) {
                for (const command of manifest.contributes?.commands ?? []) {
                  owned.effect(() =>
                    ctx.workbench.command(
                      `markdownWorkbench.${command.id}`,
                      () => {
                        const active = ctx.editors.active();
                        if (!active || !command.editorCommand) {
                          return;
                        }
                        const current = ctx.workbench.config(active.document);
                        if (
                          current.preset !== "obsidian" ||
                          !(
                            current.features?.[manifest.id]?.enabled ??
                            manifest.defaultEnabled
                          )
                        ) {
                          return;
                        }
                        return active.rpc.call(protocol, "run", {
                          command: command.editorCommand,
                        });
                      },
                    ),
                  );
                }
              },
            }),
          );
        }
      })
      .catch((error) =>
        ctx.logger.error("Feature command registration failed", error),
      );
  };
  ctx.on("editor/activeChanged", refresh);
  ctx.on("editor/opened", refresh);
  ctx.on("editor/closed", refresh);
  if (ctx.workbench.onConfiguration) {
    ctx.effect(() => ctx.workbench.onConfiguration!(refresh));
  }
  refresh();
}
