import type { Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import { exceedsDiffLimits } from "../../shared/diff";
import type { DiffSide } from "../../shared/git-diff";
import type { GitAccess } from "../../shared/git";
import { protocol } from "./protocol";

/**
 * Per-file mutation lock shared by every panel of that file. Not an SCM
 * transaction: one in-flight Stage/Revert per path, released when it finishes.
 */
const pendingFiles = new Set<string>();

function mutationHold(uri: string, hold: boolean): boolean {
  if (!hold) {
    pendingFiles.delete(uri);
    return true;
  }
  if (pendingFiles.has(uri)) {
    return false;
  }
  pendingFiles.add(uri);
  return true;
}

function sideFromKind(kind: string): DiffSide {
  if (kind === "HEAD") {
    return { kind: "HEAD", oid: "HEAD" };
  }
  if (kind === "INDEX") {
    return { kind: "INDEX", fingerprint: "index" };
  }
  if (kind === "WORKTREE") {
    return { kind: "WORKTREE" };
  }
  if (kind === "empty") {
    return { kind: "empty" };
  }
  return { kind: "revision", ref: kind, oid: kind };
}

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
  inject: { required: ["workshop", "rpc"] },
  apply(ctx, { panel }) {
    const git = ctx.workshop.git;
    const uri = panel.document.uri;
    registerBaseline(ctx, git, uri);
    registerStage(ctx, git, panel);
    registerMutationLock(ctx, uri);
    registerOpenFullDiff(ctx, uri);
    if (!git) {
      return;
    }
    watchRepository(ctx, git);
  },
};

function registerBaseline(
  ctx: Parameters<NonNullable<typeof gitGutterHost.apply>>[0],
  git: GitAccess | undefined,
  uri: string,
): void {
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
}

function registerStage(
  ctx: Parameters<NonNullable<typeof gitGutterHost.apply>>[0],
  git: GitAccess | undefined,
  panel: PanelShell,
): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "stage", async () => {
      if (!git) {
        return false;
      }
      return saveAndStage(panel, git, (message) => ctx.workshop.error(message));
    }),
  );
}

function registerMutationLock(
  ctx: Parameters<NonNullable<typeof gitGutterHost.apply>>[0],
  uri: string,
): void {
  let holding = false;
  ctx.effect(() => () => {
    if (holding) {
      mutationHold(uri, false);
      holding = false;
    }
  });
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "mutationLock", async ({ hold }) => {
      const allowed = mutationHold(uri, hold);
      holding = hold ? allowed : false;
      return allowed;
    }),
  );
}

function registerOpenFullDiff(
  ctx: Parameters<NonNullable<typeof gitGutterHost.apply>>[0],
  uri: string,
): void {
  ctx.effect(() =>
    ctx.rpc.handle(
      protocol,
      "openFullDiff",
      async ({ baseKind, targetKind }) => {
        ctx.emit("git-diff:open-full", {
          fileUri: uri,
          base: sideFromKind(baseKind),
          target: sideFromKind(targetKind),
        });
        return true;
      },
    ),
  );
}

function watchRepository(
  ctx: Parameters<NonNullable<typeof gitGutterHost.apply>>[0],
  git: GitAccess,
): void {
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
}
