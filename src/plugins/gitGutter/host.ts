import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import { exceedsDiffLimits } from "../../shared/diff";
import type { GitAccess } from "../../shared/git";
import { protocol } from "./protocol";

/** Save, then stage; nothing is staged unless the buffer reached the disk. */
async function saveAndStage(
  panel: PanelShell,
  git: GitAccess,
  report: (message: string) => void,
): Promise<boolean> {
  const saved = await panel.document.save().catch(() => false);
  if (!saved) {
    report("The note could not be saved, so nothing was staged.");
    return false;
  }
  try {
    return await git.stage(panel.document.uri);
  } catch (error) {
    report(
      `Staging failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

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
        if (result.status === "ok" && exceedsDiffLimits(result.baseline.text)) {
          return { status: "tooLarge" as const };
        }
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
        return saveAndStage(panel, git, (message) =>
          ctx.workbench.error(message),
        );
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
