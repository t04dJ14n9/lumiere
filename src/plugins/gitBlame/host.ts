import type { Context, Plugin } from "../../kernel";
import type { PanelShell } from "../../shared/runtime";
import type { GitAccess } from "../../shared/git";
import type { GitBlameLineResult } from "../../shared/git-blame";
import { MAX_DIFF_CHARS } from "../../shared/diff";
import type { Infer } from "../../kernel";
import { protocol } from "./protocol";

type BlameRequest = Infer<typeof protocol.requests.blameLine.params>;

/** Defense in depth for callers other than the schema-validated RPC channel. */
export async function readBlameLine(
  git: GitAccess | undefined,
  uri: string,
  request: BlameRequest,
): Promise<GitBlameLineResult> {
  const generation = () => git?.repoGeneration(uri) ?? 0;
  if (!git || request.contents.length > MAX_DIFF_CHARS) {
    return { status: "unavailable", repoGeneration: generation() };
  }
  try {
    return await git.blameLine(uri, request.line, {
      contents: request.contents,
      version: request.version,
    });
  } catch {
    return { status: "unavailable", repoGeneration: generation() };
  }
}

export const gitBlameHost: Plugin<{ panel: PanelShell }> = {
  name: "gitBlame",
  inject: { required: ["workshop", "rpc"] },
  apply(ctx, { panel }) {
    registerBlameRequests(ctx, panel);
    registerIdentityRequest(ctx, panel);
    registerRepositoryInvalidation(ctx, panel);
  },
};

function registerBlameRequests(ctx: Context, panel: PanelShell): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "blameLine", (request) =>
      readBlameLine(ctx.workshop.git, panel.document.uri, request),
    ),
  );
}

function registerIdentityRequest(ctx: Context, panel: PanelShell): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "identity", async () => {
      return ctx.workshop.git
        ?.identity(panel.document.uri)
        .catch(() => undefined);
    }),
  );
}

function registerRepositoryInvalidation(ctx: Context, panel: PanelShell): void {
  const git = ctx.workshop.git;
  if (!git) {
    return;
  }
  const rpc = ctx.rpc;
  ctx.effect(() =>
    git.onDidChange(() => {
      // NativeGitAccess already advanced once before fan-out. Invalidation must
      // reach the webview now; only its subsequent refresh may be debounced.
      void Promise.resolve(
        rpc.notify(protocol, "changed", {
          repoGeneration: git.repoGeneration(panel.document.uri),
        }),
      ).catch(() => undefined);
    }),
  );
}
