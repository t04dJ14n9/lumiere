import * as vscode from "vscode";
import { relative, isAbsolute, sep, dirname } from "node:path";
import { MAX_DIFF_CHARS } from "../shared/diff";
import type {
  GitBlameSnapshot,
  GitBlameLineResult,
  GitIdentity,
} from "../shared/git-blame";
import {
  runBlameLine,
  createSpawnBlameRunner,
  discoverGitRoot,
} from "./git-blame";
import type { GitBlameRunner } from "./git-blame";
import { gitSource } from "./git-source";
import { RepositoryWatch } from "./git-watch";
import { bindDiscoveredRoot, canonicalPath } from "./git-discovered-watch";
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

export class NativeGitAccess implements GitAccess {
  private watchUsers = 0;
  private readonly rootsByUri = new Map<string, string>();
  private currentApi: GitApi | undefined;
  private readonly watch = new RepositoryWatch();
  /** FS metadata watches for roots discovered without vscode.git. */
  private readonly discoveredFs = new Map<string, { dispose(): void }>();
  private enablement: vscode.Disposable | undefined;
  constructor(
    private readonly runGit: GitBlameRunner = createSpawnBlameRunner(),
  ) {}
  private api: Promise<GitApi | undefined> | undefined;
  private readonly cache = new Map<string, string>();
  private cached = 0;
  private readonly identities = new Map<
    string,
    { generation: number; pending: Promise<GitIdentity> }
  >();

  /** The API, retried on the next use while git is absent, disabled or failing. */
  private async load(): Promise<GitApi | undefined> {
    const pending = (this.api ??= gitApi().catch(() => undefined));
    const api = await pending;
    if (this.api !== pending) {
      return this.load();
    }
    if (!api) {
      this.api = undefined;
    }
    this.currentApi = api;
    if (this.watchUsers === 0) {
      return api;
    }
    if (api) {
      this.watch.attach(api);
    }
    this.enablement ??= gitExtension()?.onDidChangeEnablement?.(() => {
      this.api = undefined;
      this.currentApi = undefined;
      this.detachWatch();
      this.watch.invalidate();
      void this.load().catch(() => undefined);
    });
    return api;
  }

  private async repositoryFor(uri: string): Promise<GitRepository | undefined> {
    const git = await this.load();
    const target = vscode.Uri.parse(uri);
    const repository =
      target.scheme === "file" ? git?.getRepository(target) : undefined;
    if (repository) {
      this.rootsByUri.set(uri, repository.rootUri.toString());
    }
    return repository ?? undefined;
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

  /** Initial discovery notifies only this subscriber; repository events fan out once. */
  onDidChange(listener: () => void): () => void {
    const release = this.retainWatch();
    const unsubscribe = this.watch.subscribe(listener);
    let live = true;
    void this.load()
      .then(() => {
        if (live) {
          listener();
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
      unsubscribe();
      release();
    };
  }

  private retainWatch(): () => void {
    if (this.watchUsers === 0) {
      this.watch.invalidate();
    }
    this.watchUsers++;
    return () => {
      this.watchUsers--;
      if (this.watchUsers === 0) {
        this.detachWatch();
        this.enablement?.dispose();
        this.enablement = undefined;
      }
    };
  }

  /** Drop API and discovered-root watches together so generations stay paired. */
  private detachWatch(): void {
    this.watch.detach();
    for (const disposable of this.discoveredFs.values()) {
      disposable.dispose();
    }
    this.discoveredFs.clear();
  }

  repoGeneration(uri: string): number {
    const target = vscode.Uri.parse(uri);
    const repository =
      target.scheme === "file"
        ? this.currentApi?.getRepository(target)
        : undefined;
    const root = repository?.rootUri.toString() ?? this.rootsByUri.get(uri);
    return root ? this.watch.repoGeneration(root) : 0;
  }

  async blameLine(
    uri: string,
    line: number,
    snapshot: GitBlameSnapshot,
  ): Promise<GitBlameLineResult> {
    const release = this.retainWatch();
    try {
      return await this.blameSnapshot(uri, line, snapshot);
    } finally {
      release();
    }
  }

  private async blameSnapshot(
    uri: string,
    line: number,
    snapshot: GitBlameSnapshot,
  ): Promise<GitBlameLineResult> {
    const target = vscode.Uri.parse(uri);
    const repoGeneration = this.repoGeneration(uri);
    if (target.scheme !== "file" || snapshot.contents.length > MAX_DIFF_CHARS) {
      return { status: "unavailable", repoGeneration };
    }
    const rootPath = await this.resolveRootPath(uri, target);
    if (!rootPath) {
      return {
        status: "unavailable",
        repoGeneration: this.repoGeneration(uri),
      };
    }
    const relativePath = relative(
      canonicalPath(rootPath),
      canonicalPath(target.fsPath),
    );
    if (
      isAbsolute(relativePath) ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`)
    ) {
      return {
        status: "unavailable",
        repoGeneration: this.repoGeneration(uri),
      };
    }
    const root = vscode.Uri.file(rootPath).toString();
    return runBlameLine({
      cwd: rootPath,
      relativePath,
      line,
      snapshot,
      // RPC snapshots may include edits that have not reached the TextDocument yet.
      // Without proof of disk identity, always send the complete editor snapshot.
      knownClean: false,
      generationAtStart: this.repoGeneration(uri),
      getGeneration: () => this.watch.repoGeneration(root),
      runGit: this.runGit,
      timeoutMs: 5000,
    });
  }

  async identity(uri: string): Promise<GitIdentity | undefined> {
    const release = this.retainWatch();
    try {
      const target = vscode.Uri.parse(uri);
      if (target.scheme !== "file") {
        return undefined;
      }
      const rootPath = await this.resolveRootPath(uri, target);
      if (!rootPath) {
        return undefined;
      }
      const root = vscode.Uri.file(rootPath).toString();
      const generation = this.watch.repoGeneration(root);
      const cached = this.identities.get(root);
      if (cached?.generation === generation) {
        return cached.pending;
      }
      const pending = this.readIdentity(rootPath);
      if (this.identities.size >= 32) {
        this.identities.clear();
      }
      this.identities.set(root, { generation, pending });
      return pending;
    } finally {
      release();
    }
  }

  /**
   * Prefer vscode.git's open repository; fall back to `git rev-parse` so blame
   * still works in an empty window, before the initial scan finishes, or when
   * `git.openRepositoryInParentFolders` stays at prompt.
   */
  private async resolveRootPath(
    uri: string,
    target: vscode.Uri,
  ): Promise<string | undefined> {
    const repository = await this.repositoryFor(uri);
    if (repository) {
      return repository.rootUri.fsPath;
    }
    const discovered = await discoverGitRoot(
      dirname(target.fsPath),
      this.runGit,
    );
    if (!discovered) {
      return undefined;
    }
    const rootUri = vscode.Uri.file(discovered).toString();
    this.rootsByUri.set(uri, rootUri);
    this.ensureDiscoveredWatch(discovered, rootUri);
    return discovered;
  }

  /**
   * Empty-window / repositories(0) path: enroll the discovered root in
   * RepositoryWatch via FS metadata so amend/checkout/config bump generation
   * and publish `changed` like API `state.onDidChange`.
   */
  private ensureDiscoveredWatch(rootPath: string, rootUri: string): void {
    // Only install while a lease is held so detachWatch always owns cleanup.
    if (this.watchUsers === 0 || this.discoveredFs.has(rootUri)) {
      return;
    }
    const binding = bindDiscoveredRoot(this.watch, rootUri, rootPath);
    if (binding) {
      this.discoveredFs.set(rootUri, binding);
    }
  }

  private async readIdentity(cwd: string): Promise<GitIdentity> {
    const read = async (key: string): Promise<string> => {
      try {
        const result = await this.runGit({
          args: ["config", "--get", key],
          cwd,
          timeoutMs: 5000,
          maxBuffer: 2000,
        });
        return result.stdout.trim();
      } catch {
        return "";
      }
    };
    const [userName, userEmail] = await Promise.all([
      read("user.name"),
      read("user.email"),
    ]);
    return {
      ...(userName ? { userName } : {}),
      ...(userEmail ? { userEmail } : {}),
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
    // Match vscode.git: any workspace note (file or vscode-remote SSH), not
    // untitled/output/git buffers. Path in the query is fsPath when present.
    if (
      target.scheme === "untitled" ||
      target.scheme === "output" ||
      target.scheme === "git"
    ) {
      return undefined;
    }
    const path = target.fsPath || target.path;
    if (!path) {
      return undefined;
    }
    // The git: URI format the git extension resolves: the ref in the query.
    return target
      .with({
        scheme: "git",
        query: JSON.stringify({ path, ref }),
      })
      .toString();
  }

  sourceOf(uri: string): { source: string; ref?: string } {
    return gitSource(uri);
  }
}
