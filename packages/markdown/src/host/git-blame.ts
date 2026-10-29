import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { MAX_DIFF_CHARS } from "../shared/diff";
import { parseBlamePorcelain } from "../shared/git-blame";
import type { GitBlameLineResult, GitBlameSnapshot } from "../shared/git-blame";

/** Soft cap so a pathological commit message cannot inflate the panel bind. */
const MAX_BODY_CHARS = 8_000;

/** The host runner owns stdin, timeout and bounded output; plugins never spawn. */
export type GitBlameRunner = (options: {
  args: readonly string[];
  cwd: string;
  stdin?: string;
  timeoutMs: number;
  maxBuffer?: number;
}) => Promise<{ stdout: string; stderr: string }>;

export interface SpawnGitOptions {
  /** The `git` to run; by default the one on the PATH. */
  readonly program?: string;
  /** Added to the process's own environment for every `git` it runs. */
  readonly env?: Readonly<Record<string, string>>;
}

export function createSpawnBlameRunner(
  launch: typeof spawn = spawn,
  { program = "git", env }: SpawnGitOptions = {},
): GitBlameRunner {
  return ({ args, cwd, stdin, timeoutMs, maxBuffer = 2_000_000 }) =>
    new Promise((resolve, reject) => {
      const child = launch(program, [...args], spawnOptions(cwd, env));
      let stdout = "";
      let stderr = "";
      let bytes = 0;
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (error) {
          child.kill("SIGKILL");
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      };
      const timer = setTimeout(
        () => finish(new Error(`git timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      const collect = (chunk: string, isError: boolean): void => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > maxBuffer) {
          finish(new Error("git output exceeds buffer limit"));
          return;
        }
        if (isError) {
          stderr += chunk;
        } else {
          stdout += chunk;
        }
      };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => collect(chunk, false));
      child.stderr.on("data", (chunk: string) => collect(chunk, true));
      child.on("error", finish);
      child.on("close", (code) =>
        finish(
          code === 0 ? undefined : new Error(stderr || `git exited ${code}`),
        ),
      );
      // An early git exit can close the pipe while the snapshot is being written.
      child.stdin.on("error", finish);
      if (stdin !== undefined) {
        child.stdin.write(stdin);
      }
      child.stdin.end();
    });
}

function spawnOptions(
  cwd: string,
  env: Readonly<Record<string, string>> | undefined,
): SpawnOptionsWithoutStdio {
  return env
    ? { cwd, stdio: "pipe", env: { ...process.env, ...env } }
    : { cwd, stdio: "pipe" };
}

/** Resolve the work tree when vscode.git has not opened the repository yet. */
export async function discoverGitRoot(
  cwd: string,
  runGit: GitBlameRunner,
): Promise<string | undefined> {
  try {
    const { stdout } = await runGit({
      args: ["rev-parse", "--show-toplevel"],
      cwd,
      timeoutMs: 5000,
      maxBuffer: 4096,
    });
    const root = stdout.trim();
    return root.length > 0 ? root : undefined;
  } catch {
    return undefined;
  }
}

interface BlameOptions {
  cwd: string;
  relativePath: string;
  line: number;
  snapshot: GitBlameSnapshot;
  knownClean: boolean;
  generationAtStart: number;
  getGeneration(): number;
  runGit: GitBlameRunner;
  timeoutMs?: number;
}

export async function runBlameLine(
  options: BlameOptions,
): Promise<GitBlameLineResult> {
  const { line, snapshot, knownClean, generationAtStart, getGeneration } =
    options;
  if (
    !Number.isSafeInteger(line) ||
    line < 1 ||
    snapshot.contents.length === 0
  ) {
    return { status: "empty", repoGeneration: getGeneration() };
  }
  if (snapshot.contents.length > MAX_DIFF_CHARS) {
    return { status: "unavailable", repoGeneration: getGeneration() };
  }
  const args = ["blame", "--line-porcelain", "-L", `${line},${line}`];
  if (!knownClean) {
    args.push("--contents", "-", "HEAD");
  }
  // With no explicit revision, git includes uncommitted worktree lines. A clean
  // editor snapshot only proves disk identity, not that disk equals HEAD.
  args.push("--", options.relativePath);
  try {
    const { stdout } = await options.runGit({
      args,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs ?? 5000,
      ...(knownClean ? {} : { stdin: snapshot.contents }),
    });
    const repoGeneration = getGeneration();
    if (repoGeneration !== generationAtStart) {
      return { status: "stale", repoGeneration };
    }
    const parsed = parseBlamePorcelain(stdout, line);
    if (parsed.status !== "ok") {
      return { ...parsed, repoGeneration };
    }
    const body = await commitBody(options, parsed.blame.commit);
    if (getGeneration() !== generationAtStart) {
      return { status: "stale", repoGeneration: getGeneration() };
    }
    return {
      status: "ok",
      blame: { ...parsed.blame, body },
      repoGeneration: getGeneration(),
    };
  } catch (error) {
    const repoGeneration = getGeneration();
    if (repoGeneration !== generationAtStart) {
      return { status: "stale", repoGeneration };
    }
    const isUntracked =
      error instanceof Error &&
      /no such path|no such ref|bad revision/.test(error.message);
    return {
      status: isUntracked ? "untracked" : "unavailable",
      repoGeneration,
    };
  }
}

/** Full commit body (`%b`); soft-fail to "" so the ghost still paints. */
async function commitBody(
  options: BlameOptions,
  commit: string,
): Promise<string> {
  try {
    const { stdout } = await options.runGit({
      args: ["log", "-1", "--format=%b", commit],
      cwd: options.cwd,
      timeoutMs: Math.min(options.timeoutMs ?? 5000, 3000),
      // Byte floor for UTF-8: up to 4 bytes/char, then slice by characters.
      maxBuffer: MAX_BODY_CHARS * 4 + 64,
    });
    const body = stdout.replace(/\s+$/u, "");
    return body.length > MAX_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS) : body;
  } catch {
    return "";
  }
}
