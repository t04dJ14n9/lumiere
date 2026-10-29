/**
 * A note's text at HEAD or in the index, as the change gutter compares it:
 * LF line endings, and nothing past the diff limits. HEAD texts are cached by
 * commit, since a commit's text never changes; the index's is read each time.
 */
import type { GitBlameRunner } from "@workshop/markdown/node";
import {
  exceedsDiffLimits,
  MAX_DIFF_CHARS,
  type GitBaselineResult,
  type GitRef,
} from "@workshop/markdown/portable";

const TIMEOUT_MS = 5000;
/** A text at the diff limit is at most 3 UTF-8 bytes per UTF-16 unit; 4 leaves room. */
const MAX_BLOB_BYTES = MAX_DIFF_CHARS * 4;
/** Cached HEAD texts, by total length, so the cache cannot grow without bound. */
const CACHE_CHARS = 8_000_000;
const CACHE_ENTRIES = 64;

/** Where a note is: its repository's work tree and its path there with `/`. */
export interface BlobLocation {
  readonly root: string;
  readonly gitPath: string;
}

export class GitBlobs {
  private readonly cache = new Map<string, string>();
  private cached = 0;

  constructor(private readonly runGit: GitBlameRunner) {}

  async baseline(
    location: BlobLocation,
    ref: GitRef,
  ): Promise<GitBaselineResult> {
    const commit =
      ref === "HEAD" ? await this.headCommit(location.root) : undefined;
    if (ref === "HEAD" && !commit) {
      // A repository with no commit yet: nothing is at HEAD.
      return { status: "untracked" };
    }
    const read = await this.text(location, commit);
    if (read === "untracked" || read === "tooLarge") {
      return { status: read };
    }
    const label = commit ? `HEAD (${commit.slice(0, 7)})` : "Index";
    return { status: "ok", baseline: { text: read, label } };
  }

  private async headCommit(root: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.runGit({
        args: ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
        cwd: root,
        timeoutMs: TIMEOUT_MS,
        maxBuffer: 256,
      });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /** `<commit>:<path>`, or the index's `:<path>` without a commit. */
  private async text(
    location: BlobLocation,
    commit: string | undefined,
  ): Promise<string | "untracked" | "tooLarge"> {
    const spec = `${commit ?? ""}:${location.gitPath}`;
    const key = `${location.root}\0${spec}`;
    const cached = commit ? this.cache.get(key) : undefined;
    if (cached !== undefined) {
      return cached;
    }
    let raw: string;
    try {
      raw = (
        await this.runGit({
          args: ["cat-file", "blob", spec],
          cwd: location.root,
          timeoutMs: TIMEOUT_MS,
          maxBuffer: MAX_BLOB_BYTES,
        })
      ).stdout;
    } catch (error) {
      // The runner's own refusal of a long output; anything else means the
      // note is not there (new, untracked, or in a merge conflict).
      return /exceeds buffer limit/.test(String(error))
        ? "tooLarge"
        : "untracked";
    }
    const text = raw.replace(/\r\n?/g, "\n");
    if (exceedsDiffLimits(text)) {
      return "tooLarge";
    }
    if (commit) {
      this.remember(key, text);
    }
    return text;
  }

  private remember(key: string, text: string): void {
    if (
      this.cache.size >= CACHE_ENTRIES ||
      this.cached + text.length > CACHE_CHARS
    ) {
      this.cache.clear();
      this.cached = 0;
    }
    this.cache.set(key, text);
    this.cached += text.length;
  }
}
