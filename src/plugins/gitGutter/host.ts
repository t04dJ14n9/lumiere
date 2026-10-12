import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import { protocol } from "./protocol";

/** Reads the note's git baseline through VS Code's git extension; never shells out. */
export const gitGutterHost: Plugin<{ panel: PanelShell }> = {
  name: "gitGutter",
  inject: { required: ["workbench", "rpc"] },
  apply(ctx, { panel }) {
    const git = ctx.workbench.git;
    const uri = panel.document.uri;
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "baseline", async ({ ref }) => {
        const result = git
          ? await git.baseline(uri, ref)
          : { status: "unavailable" as const };
        return result.status === "ok"
          ? {
              status: "ok" as const,
              text: result.baseline.text,
              label: result.baseline.label,
            }
          : { status: result.status };
      }),
    );
    ctx.effect(() =>
      ctx.rpc.handle(protocol, "stage", async () => {
        if (!git) {
          return false;
        }
        await panel.document.save();
        return git.stage(uri);
      }),
    );
    if (!git) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rpc = ctx.rpc;
    ctx.effect(() => () => clearTimeout(timer));
    ctx.effect(() =>
      git.onDidChange(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void Promise.resolve(rpc.notify(protocol, "changed", {})).catch(
            () => undefined,
          );
        }, 150);
      }),
    );
  },
};
