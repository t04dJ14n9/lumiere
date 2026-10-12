import * as vscode from "vscode";
import { exceedsDiffLimits } from "../shared/diff";
import type { GitAccess, GitBaselineResult, GitRef } from "../shared/git";

/** Cached HEAD texts, by total length, so the cache cannot grow without bound. */
const CACHE_CHARS = 8_000_000;

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
  readonly onDidChangeEnablement: vscode.Event<boolean>;
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

/** The git extension's exports once it is active. */
function gitExtension(): GitExtension | undefined {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  return extension?.isActive ? extension.exports : undefined;
}

export function createGitAccess(): GitAccess {
  return new NativeGitAccess();
}

class NativeGitAccess implements GitAccess {
  private api: Promise<GitApi | undefined> | undefined;
  private readonly cache = new Map<string, string>();
  private cached = 0;

  /** The API, retried on the next use while git is absent, disabled or failing. */
  private async load(): Promise<GitApi | undefined> {
    const pending = (this.api ??= gitApi().catch(() => undefined));
    const api = await pending;
    if (!api && this.api === pending) {
      this.api = undefined;
    }
    return api;
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
      if (text === undefined) {
        return { status: "tooLarge" };
      }
      const label = ref === "HEAD" ? `HEAD (${commit!.slice(0, 7)})` : "Index";
      return { status: "ok", baseline: { text, label } };
    } catch {
      return { status: "untracked" };
    }
  }

  /**
   * `git show <commit>:<path>`, or the index (":path") without a commit; HEAD
   * text is cached. Undefined past the diff limits, and then never cached.
   */
  private async show(
    repository: GitRepository,
    commit: string | undefined,
    path: string,
  ): Promise<string | undefined> {
    const key = `${commit}:${path}`;
    const cached = commit ? this.cache.get(key) : undefined;
    if (cached !== undefined) {
      return cached;
    }
    const text = (await repository.show(commit ?? "", path)).replace(
      /\r\n?/g,
      "\n",
    );
    if (exceedsDiffLimits(text)) {
      return undefined;
    }
    if (commit) {
      if (this.cache.size >= 64 || this.cached + text.length > CACHE_CHARS) {
        this.cache.clear();
        this.cached = 0;
      }
      this.cache.set(key, text);
      this.cached += text.length;
    }
    return text;
  }

  /**
   * Repository changes, opened and closed repositories, and git being enabled
   * or disabled: each tells the editors to reload their baseline.
   */
  onDidChange(listener: () => void): () => void {
    const watch = new RepositoryWatch(listener);
    let enablement: vscode.Disposable | undefined;
    let live = true;
    const attach = (): void =>
      void this.load().then((git) => {
        if (!live) {
          return;
        }
        if (git) {
          watch.attach(git);
        }
        // Enabling or disabling git later drops the API and attaches again.
        enablement ??= gitExtension()?.onDidChangeEnablement?.(() => {
          this.api = undefined;
          attach();
        });
        // Repositories found before this listener was attached.
        listener();
      });
    attach();
    return () => {
      live = false;
      enablement?.dispose();
      watch.dispose();
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

/** Subscriptions to every repository of one or more API instances. */
class RepositoryWatch {
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly repositories = new Set<GitRepository>();
  private readonly apis = new Set<GitApi>();
  private live = true;
  constructor(private readonly listener: () => void) {}
  attach(git: GitApi): void {
    if (!this.live || this.apis.has(git)) {
      return;
    }
    this.apis.add(git);
    git.repositories.forEach((repository) => this.watch(repository));
    this.subscriptions.push(
      git.onDidOpenRepository((repository) => {
        this.watch(repository);
        this.listener();
      }),
      git.onDidCloseRepository(() => this.listener()),
    );
  }
  private watch(repository: GitRepository): void {
    if (!this.repositories.has(repository)) {
      this.repositories.add(repository);
      this.subscriptions.push(
        repository.state.onDidChange(() => this.listener()),
      );
    }
  }
  dispose(): void {
    this.live = false;
    this.subscriptions
      .splice(0)
      .forEach((subscription) => subscription.dispose());
  }
}
