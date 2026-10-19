import type { Context, Plugin, Infer } from "@workshop/core";
import type { PanelShell } from "../../shared/host";
import type { GitAccess } from "../../shared/git";
import type { GitBlameLineResult } from "../../shared/git-blame";
import { MAX_DIFF_CHARS } from "../../shared/diff";
import { protocol } from "./protocol";

type BlameRequest = Infer<typeof protocol.requests.blameLine.params>;

/** Defense in depth for callers other than the schema-validated RPC channel. */
export async function readBlameLine(
  git: GitAccess,
  uri: string,
  request: BlameRequest,
): Promise<GitBlameLineResult> {
  const generation = () => git.repoGeneration(uri);
  if (request.contents.length > MAX_DIFF_CHARS) {
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
  inject: { required: ["git", "rpc"] },
  apply(ctx, { panel }) {
    registerBlameRequests(ctx, panel);
    registerIdentityRequest(ctx, panel);
    registerRepositoryInvalidation(ctx, panel);
  },
};

function registerBlameRequests(ctx: Context, panel: PanelShell): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "blameLine", (request) =>
      readBlameLine(ctx.git, panel.document.uri, request),
    ),
  );
}

function registerIdentityRequest(ctx: Context, panel: PanelShell): void {
  ctx.effect(() =>
    ctx.rpc.handle(protocol, "identity", async () => {
      return ctx.git.identity(panel.document.uri).catch(() => undefined);
    }),
  );
}

function registerRepositoryInvalidation(ctx: Context, panel: PanelShell): void {
  const { git, rpc } = ctx;
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
