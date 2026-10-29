/**
 * Git outside VS Code, from the `git` command line: what VS Code's git
 * extension gives the Git plugins there (blame, the change gutter, staging),
 * for notes inside the host's workspace roots. It is built from the VS Code
 * adapter's own command-line half (`@workshop/markdown/portable`): the blame
 * runner, repository discovery, and the `.git` watch that counts a
 * repository's changes.
 *
 * Without git (git-program.ts), or for a note in no repository, every answer
 * is the one VS Code gives when its git extension is off: unavailable.
 */
import { spawn } from "node:child_process";
import * as path from "node:path";
import {
  bindDiscoveredRoot,
  canonicalPath,
  createSpawnBlameRunner,
  discoverGitRoot,
  RepositoryWatch,
  runBlameLine,
  type GitAccess,
  type GitBaselineResult,
  type GitBlameLineResult,
  type GitBlameRunner,
  type GitBlameSnapshot,
  type GitIdentity,
  type GitRef,
} from "@workshop/markdown/portable";
import { GitBlobs, type BlobLocation } from "./git-blobs";
import { findGit } from "./git-program";
import { pathInsideRoots } from "./paths";

const TIMEOUT_MS = 5000;

/**
 * Never wait for a password or an editor, and take no lock a `git` the owner
 * runs at the same time would trip over. English messages, as VS Code's git
 * extension sets them: runBlameLine tells "untracked" by git's wording.
 */
const QUIET_GIT: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "en_US.UTF-8",
  LANG: "en_US.UTF-8",
};

export interface NodeGitOptions {
  /** The workspace roots, as file URIs: only notes inside them are asked about. */
  readonly roots: () => readonly string[];
  /** Runs `git`; tests may pass their own. */
  readonly runGit?: GitBlameRunner;
}

/** A note in a repository: its canonical work tree and its path there. */
interface Located extends BlobLocation {
  /** With the platform's separators, for `git blame -- <path>`. */
  readonly relativePath: string;
}

export class NodeGitAccess implements GitAccess {
  /** Each repository's change count; shared by every page, like VS Code's. */
  private readonly watch = new RepositoryWatch();
  private readonly watched = new Map<string, { dispose(): void }>();
  /** The repository each asked-about note was last found in, for repoGeneration. */
  private readonly rootOf = new Map<string, string>();
  private readonly identities = new Map<
    string,
    { readonly generation: number; readonly pending: Promise<GitIdentity> }
  >();
  private readonly runGit: GitBlameRunner;
  private readonly blobs: GitBlobs;
  private disposed = false;

  constructor(private readonly options: NodeGitOptions) {
    this.runGit = options.runGit ?? foundGitRunner();
    this.blobs = new GitBlobs(this.runGit);
  }

  async blameLine(
    uri: string,
    line: number,
    snapshot: GitBlameSnapshot,
  ): Promise<GitBlameLineResult> {
    const located = await this.locate(uri);
    if (!located) {
      return {
        status: "unavailable",
        repoGeneration: this.repoGeneration(uri),
      };
    }
    const generation = () => this.watch.repoGeneration(located.root);
    return runBlameLine({
      cwd: located.root,
      relativePath: located.relativePath,
      line,
      snapshot,
      // The page's snapshot may hold edits that are not on disk yet, so it
      // is always what git blames.
      knownClean: false,
      generationAtStart: generation(),
      getGeneration: generation,
      runGit: this.runGit,
      timeoutMs: TIMEOUT_MS,
    });
  }

  async identity(uri: string): Promise<GitIdentity | undefined> {
    const located = await this.locate(uri);
    if (!located) {
      return undefined;
    }
    const generation = this.watch.repoGeneration(located.root);
    const cached = this.identities.get(located.root);
    if (cached?.generation === generation) {
      return cached.pending;
    }
    const pending = readIdentity(located.root, this.runGit);
    this.identities.set(located.root, { generation, pending });
    return pending;
  }

  repoGeneration(uri: string): number {
    const root = this.rootOf.get(uri);
    return root ? this.watch.repoGeneration(root) : 0;
  }

  async baseline(uri: string, ref: GitRef): Promise<GitBaselineResult> {
    const located = await this.locate(uri);
    return located
      ? this.blobs.baseline(located, ref)
      : { status: "unavailable" };
  }

  /** A commit, checkout, stage or config change in any repository a note was found in. */
  onDidChange(listener: () => void): () => void {
    return this.watch.subscribe(listener);
  }

  /** Throws what git said when it refuses (an ignored file, a locked index). */
  async stage(uri: string): Promise<boolean> {
    const located = await this.locate(uri);
    if (!located) {
      return false;
    }
    await this.runGit({
      args: ["add", "--", located.relativePath],
      cwd: located.root,
      timeoutMs: TIMEOUT_MS,
    });
    return true;
  }

  /** `git:` URIs are VS Code's git extension's; nothing here opens them. */
  toGitUri(): string | undefined {
    return undefined;
  }

  /** Stop watching every repository, also one a question still running finds. */
  dispose(): void {
    this.disposed = true;
    for (const binding of this.watched.values()) {
      binding.dispose();
    }
    this.watched.clear();
    this.watch.dispose();
  }

  /**
   * The repository `uri` is in, asked of git each time (`git init` or a
   * removed `.git` take effect at once), and watched from then on. Undefined
   * for a note outside the workspace roots or in no repository.
   */
  private async locate(uri: string): Promise<Located | undefined> {
    let file: string;
    try {
      file = await pathInsideRoots(this.options.roots(), uri);
    } catch {
      return undefined;
    }
    const found = await discoverGitRoot(path.dirname(file), this.runGit);
    if (!found) {
      return undefined;
    }
    // git names the work tree with symbolic links resolved; so must the note.
    const root = canonicalPath(found);
    const relativePath = path.relative(root, canonicalPath(file));
    if (isOutside(relativePath)) {
      return undefined;
    }
    this.rootOf.set(uri, root);
    this.watchRepository(root);
    return {
      root,
      relativePath,
      gitPath: relativePath.split(path.sep).join("/"),
    };
  }

  private watchRepository(root: string): void {
    // A watch armed after stopping would keep the host's process alive.
    if (this.disposed || this.watched.has(root)) {
      return;
    }
    const binding = bindDiscoveredRoot(this.watch, root, root);
    if (binding) {
      this.watched.set(root, binding);
    }
  }
}

/**
 * Runs the `git` findGit names, looked for once, on first use: Git that is
 * installed while the host runs is seen after a restart, as in VS Code.
 */
function foundGitRunner(): GitBlameRunner {
  let found: Promise<GitBlameRunner | undefined> | undefined;
  return async (options) => {
    found ??= findGit().then((program) =>
      program === undefined
        ? undefined
        : createSpawnBlameRunner(spawn, { program, env: QUIET_GIT }),
    );
    const run = await found;
    if (!run) {
      throw new Error("git is not installed");
    }
    return run(options);
  };
}

function isOutside(relative: string): boolean {
  return (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

/** The author git would record in this repository: its own config, then the owner's. */
async function readIdentity(
  root: string,
  runGit: GitBlameRunner,
): Promise<GitIdentity> {
  const read = async (key: string): Promise<string> => {
    try {
      const { stdout } = await runGit({
        args: ["config", "--get", key],
        cwd: root,
        timeoutMs: TIMEOUT_MS,
        maxBuffer: 2000,
      });
      return stdout.trim();
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
