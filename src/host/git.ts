import * as vscode from "vscode";
import type { GitAccess, GitBaselineResult, GitRef } from "../shared/git";

/** The slice of the git extension's API 1 (extensions/git/src/api/git.d.ts) used here. */
interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    readonly HEAD?: { readonly commit?: string };
    readonly onDidChange: vscode.Event<void>;
  };
  show(ref: string, path: string): Promise<string>;
  add(paths: string[]): Promise<void>;
}
interface GitApi {
  readonly state: "uninitialized" | "initialized";
  readonly onDidChangeState: vscode.Event<"uninitialized" | "initialized">;
  readonly repositories: readonly GitRepository[];
  readonly onDidOpenRepository: vscode.Event<GitRepository>;
  readonly onDidCloseRepository: vscode.Event<GitRepository>;
  getRepository(uri: vscode.Uri): GitRepository | null;
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}
interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

/** `vscode.git`'s API, activated on first use; undefined when git is absent or disabled. */
async function gitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) {
    return undefined;
  }
  const exports = extension.isActive
    ? extension.exports
    : await extension.activate();
  if (!exports?.enabled) {
    return undefined;
  }
  const api = exports.getAPI(1);
  if (api.state !== "initialized") {
    await new Promise<void>((resolve) => {
      const listener = api.onDidChangeState((state) => {
        if (state === "initialized") {
          listener.dispose();
          resolve();
        }
      });
    });
  }
  return api;
}

export function createGitAccess(): GitAccess {
  return new NativeGitAccess();
}

class NativeGitAccess implements GitAccess {
  private api: Promise<GitApi | undefined> | undefined;
  private readonly cache = new Map<string, string>();

  private load(): Promise<GitApi | undefined> {
    return (this.api ??= gitApi().catch(() => undefined));
  }

  private async repositoryFor(uri: string): Promise<GitRepository | undefined> {
    const git = await this.load();
    const target = vscode.Uri.parse(uri);
    return target.scheme === "file"
      ? (git?.getRepository(target) ?? undefined)
      : undefined;
  }

  async baseline(uri: string, ref: GitRef): Promise<GitBaselineResult> {
    const repository = await this.repositoryFor(uri);
    if (!repository) {
      return { status: "unavailable" };
    }
    const path = vscode.Uri.parse(uri).fsPath;
    const commit = repository.state.HEAD?.commit;
    if (ref === "HEAD" && !commit) {
      return { status: "untracked" };
    }
    try {
      const text = await this.show(
        repository,
        ref === "HEAD" ? commit! : undefined,
        path,
      );
      const label = ref === "HEAD" ? `HEAD (${commit!.slice(0, 7)})` : "Index";
      return { status: "ok", baseline: { text, label } };
    } catch {
      return { status: "untracked" };
    }
  }

  /** `git show <commit>:<path>`, or the index (":path") without a commit; HEAD text is cached. */
  private async show(
    repository: GitRepository,
    commit: string | undefined,
    path: string,
  ) {
    const key = `${commit}:${path}`;
    const cached = commit ? this.cache.get(key) : undefined;
    if (cached !== undefined) {
      return cached;
    }
    const text = (await repository.show(commit ?? "", path)).replace(
      /\r\n?/g,
      "\n",
    );
    if (commit) {
      if (this.cache.size > 64) {
        this.cache.clear();
      }
      this.cache.set(key, text);
    }
    return text;
  }

  onDidChange(listener: () => void): () => void {
    const subscriptions: vscode.Disposable[] = [];
    const watched = new Set<GitRepository>();
    let live = true;
    const watch = (repository: GitRepository) => {
      if (!watched.has(repository)) {
        watched.add(repository);
        subscriptions.push(repository.state.onDidChange(() => listener()));
      }
    };
    void this.load().then((git) => {
      if (!git || !live) {
        return;
      }
      git.repositories.forEach(watch);
      subscriptions.push(
        git.onDidOpenRepository((repository) => {
          watch(repository);
          listener();
        }),
        git.onDidCloseRepository(() => listener()),
      );
      // Repositories found before this listener was attached.
      listener();
    });
    return () => {
      live = false;
      for (const subscription of subscriptions) {
        subscription.dispose();
      }
    };
  }

  async stage(uri: string): Promise<boolean> {
    const repository = await this.repositoryFor(uri);
    if (!repository) {
      return false;
    }
    await repository.add([vscode.Uri.parse(uri).fsPath]);
    return true;
  }

  toGitUri(uri: string, ref: string): string | undefined {
    const target = vscode.Uri.parse(uri);
    if (target.scheme !== "file") {
      return undefined;
    }
    // The git: URI format the git extension resolves: the ref in the query.
    return target
      .with({
        scheme: "git",
        query: JSON.stringify({ path: target.fsPath, ref }),
      })
      .toString();
  }
}
