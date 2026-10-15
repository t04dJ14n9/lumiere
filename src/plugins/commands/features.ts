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
        await reconcileFeatureCommands(ctx, manifests, fibers);
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

async function reconcileFeatureCommands(
  ctx: Context,
  manifests: readonly Manifest[],
  fibers: Map<string, Fiber>,
): Promise<void> {
  const panel = ctx.editors.active();
  const settings = panel ? ctx.workbench.config(panel.document) : undefined;
  for (const manifest of manifests) {
    const enabled = Boolean(
      panel &&
      settings?.preset === "obsidian" &&
      (settings.features?.[manifest.id]?.enabled ?? manifest.defaultEnabled),
    );
    const previous = fibers.get(manifest.id);
    if (!enabled && previous) {
      await previous.dispose();
      fibers.delete(manifest.id);
    }
    if (!enabled || fibers.has(manifest.id)) {
      continue;
    }
    fibers.set(manifest.id, registerFeatureCommands(ctx, manifest));
  }
}

function registerFeatureCommands(ctx: Context, manifest: Manifest): Fiber {
  return ctx.plugin({
    name: `commands:${manifest.id}`,
    apply(owned) {
      for (const command of manifest.contributes?.commands ?? []) {
        // Host-only commands (no editorCommand) register themselves.
        if (!command.editorCommand) {
          continue;
        }
        owned.effect(() =>
          ctx.workbench.command(`markdownWorkbench.${command.id}`, () =>
            runFeatureCommand(ctx, manifest, command),
          ),
        );
      }
    },
  });
}

function runFeatureCommand(
  ctx: Context,
  manifest: Pick<Manifest, "id" | "defaultEnabled">,
  command: { readonly editorCommand?: string },
) {
  const active = ctx.editors.active();
  if (!active || !command.editorCommand) {
    return;
  }
  const current = ctx.workbench.config(active.document);
  if (
    current.preset !== "obsidian" ||
    !(current.features?.[manifest.id]?.enabled ?? manifest.defaultEnabled)
  ) {
    return;
  }
  return active.rpc.call(protocol, "run", {
    command: command.editorCommand,
  });
}
