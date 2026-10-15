import { spawn } from "node:child_process";
import { MAX_DIFF_CHARS } from "../shared/diff";
import { parseBlamePorcelain } from "../shared/git-blame";
import type { GitBlameLineResult, GitBlameSnapshot } from "../shared/git-blame";

/** The host runner owns stdin, timeout and bounded output; plugins never spawn. */
export type GitBlameRunner = (options: {
  args: readonly string[];
  cwd: string;
  stdin?: string;
  timeoutMs: number;
  maxBuffer?: number;
}) => Promise<{ stdout: string; stderr: string }>;

export function createSpawnBlameRunner(
  launch: typeof spawn = spawn,
): GitBlameRunner {
  return ({ args, cwd, stdin, timeoutMs, maxBuffer = 2_000_000 }) =>
    new Promise((resolve, reject) => {
      const child = launch("git", [...args], { cwd, stdio: "pipe" });
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
    args.push("--contents", "-");
  }
  args.push("HEAD", "--", options.relativePath);
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
    return { ...parseBlamePorcelain(stdout, line), repoGeneration };
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
