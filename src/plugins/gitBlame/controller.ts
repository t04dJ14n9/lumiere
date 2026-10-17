import { MAX_DIFF_CHARS } from "../../shared/diff";
import type { GitBlameLineResult, GitBlameOk } from "../../shared/git-blame";
import type { BlameEpoch } from "./epoch";
import { shouldApplyBlame } from "./epoch";

interface BlameSource {
  readonly uri: string;
  readonly docVersion: number;
  readonly caretLine: number;
  /** Selection main head; used only for the only-after-caret-move gate. */
  readonly caretHead: number;
}
interface ControllerOptions {
  read(): BlameSource;
  contents(): string;
  request(params: {
    line: number;
    contents: string;
    version: number;
  }): Promise<GitBlameLineResult>;
  paint(value: GitBlameOk | null): void;
  after(callback: () => void, ms: number): () => void;
}

/** One panel's pending work; the URI/lifetime serial is deliberately private to B2. */
export class BlameController {
  private source: BlameSource;
  private generation = 0;
  private serial = 0;
  private live = true;
  private cancelTimer: (() => void) | undefined;
  /**
   * VS Code-inspired gate: do not paint on open/restored caret. Unlock after
   * the first real caret move in this panel (column-only counts); URI switch
   * resets so a newly opened file stays quiet until the user moves again.
   */
  private seenCaretMove = false;
  constructor(private readonly options: ControllerOptions) {
    this.source = options.read();
  }

  get epoch(): BlameEpoch {
    return {
      docVersion: this.source.docVersion,
      caretLine: this.source.caretLine,
      repoGeneration: this.generation,
    };
  }
  get requestSerial(): number {
    return this.serial;
  }
  /** Test/read helper: whether a caret move has unlocked painting. */
  get allowsPaint(): boolean {
    return this.seenCaretMove;
  }

  update(): void {
    if (!this.live) {
      return;
    }
    const source = this.options.read();
    if (source.uri !== this.source.uri) {
      // New document in this panel: treat as a fresh open (no ghost yet).
      this.seenCaretMove = false;
      this.source = source;
      this.invalidate();
      this.schedule();
      return;
    }
    const headMoved = source.caretHead !== this.source.caretHead;
    if (headMoved) {
      const unlocked = !this.seenCaretMove;
      this.seenCaretMove = true;
      if (sameBlameKey(source, this.source)) {
        // Column-only (or same-line) move: no re-blame request once painted,
        // but the first unlock must schedule so the current line can appear.
        this.source = source;
        if (unlocked) {
          this.schedule();
        }
        return;
      }
    } else if (sameBlameKey(source, this.source)) {
      return;
    }
    this.source = source;
    this.invalidate();
    this.schedule();
  }

  repositoryChanged(generation: number): void {
    if (!this.live) {
      return;
    }
    this.generation = generation;
    this.invalidate();
    this.schedule();
  }

  async refresh(): Promise<void> {
    if (!this.live) {
      return;
    }
    this.update();
    this.cancelRefresh();
    // Open/restored caret: stay quiet and skip host work until a real move.
    if (!this.seenCaretMove) {
      this.options.paint(null);
      return;
    }
    const serial = ++this.serial;
    const source = this.source;
    const epoch = this.epoch;
    try {
      const contents = this.options.contents();
      if (contents.length > MAX_DIFF_CHARS) {
        this.options.paint(null);
        return;
      }
      const result = await this.options.request({
        line: source.caretLine,
        contents,
        version: source.docVersion,
      });
      if (!this.isCurrent({ serial, source, epoch })) {
        return;
      }
      // A new/re-enabled panel may start at zero while the host is already at N.
      // Any observed changed, URI switch or disable invalidates this serial first.
      this.generation = result.repoGeneration;
      if (!this.seenCaretMove) {
        this.options.paint(null);
        return;
      }
      const blame = result.status === "ok" ? result.blame : null;
      this.options.paint(blame?.line === source.caretLine ? blame : null);
    } catch {
      // Obsolete rejection must not erase a newer successful request's ghost.
      if (this.isCurrent({ serial, source, epoch })) {
        this.options.paint(null);
      }
    }
  }

  dispose(): void {
    this.live = false;
    this.invalidate();
  }

  private isCurrent(request: {
    serial: number;
    source: BlameSource;
    epoch: BlameEpoch;
  }): boolean {
    return (
      this.live &&
      request.serial === this.serial &&
      // Column-only moves must not discard an in-flight same-line result.
      sameBlameKey(request.source, this.options.read()) &&
      shouldApplyBlame(request.epoch, this.epoch)
    );
  }

  private invalidate(): void {
    this.serial++;
    this.cancelRefresh();
    this.options.paint(null);
  }

  private schedule(): void {
    this.cancelTimer = this.options.after(() => {
      void this.refresh();
    }, 150);
  }

  private cancelRefresh(): void {
    this.cancelTimer?.();
    this.cancelTimer = undefined;
  }
}

/** URI + doc + caret line — blame payload identity (ignores column). */
function sameBlameKey(left: BlameSource, right: BlameSource): boolean {
  return (
    left.uri === right.uri &&
    left.docVersion === right.docVersion &&
    left.caretLine === right.caretLine
  );
}
