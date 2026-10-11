/** The whole host-session history is bounded, including the current stop. */
export const MAX_JUMP_HISTORY_ENTRIES = 100;

/** An opaque, single-use replay token, valid only in the history that made it. */
export type JumpHistoryToken = symbol;

export interface JumpHistoryTransition<T> {
  readonly token: JumpHistoryToken;
  readonly target: T;
}

export interface JumpHistoryOptions<T> {
  /** Compare complete stops, including document, pane and position identity. */
  equals(a: T, b: T): boolean;
  /** Copy every mutable part of a stop; used on both ingress and egress. */
  clone(entry: T): T;
  /** A positive integer no greater than 100. Defaults to 100. */
  capacity?: number;
}

/**
 * Discrete navigation stops, independent of any editor or document format.
 * A host owns one instance for its session and records successful explicit
 * jumps. Continuous scroll/view events do not create history entries.
 *
 * Back/forward prepare a destination. The host must commit its token only
 * after navigation succeeds, or cancel it on failure. Preparing a newer
 * replay, recording a jump or refreshing the current stop invalidates an
 * outstanding token, so late asynchronous completions cannot move the cursor.
 */
export class JumpHistory<T> {
  private readonly equals: JumpHistoryOptions<T>["equals"];
  private readonly clone: JumpHistoryOptions<T>["clone"];
  private readonly capacity: number;
  private readonly entries: T[] = [];
  private cursor = -1;
  private preserveDeparture = false;
  private pending: { token: JumpHistoryToken; index: number } | undefined;

  constructor(options: JumpHistoryOptions<T>) {
    const capacity = options.capacity ?? MAX_JUMP_HISTORY_ENTRIES;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_JUMP_HISTORY_ENTRIES) {
      throw new RangeError(`Jump history capacity must be an integer from 1 to ${MAX_JUMP_HISTORY_ENTRIES}`);
    }
    this.equals = options.equals;
    this.clone = options.clone;
    this.capacity = capacity;
  }

  get hasDeparture(): boolean { return this.preserveDeparture; }
  releaseDeparture(): void { this.preserveDeparture = false; }

  get current(): T | undefined {
    return this.cursor < 0 ? undefined : this.clone(this.entries[this.cursor]!);
  }

  get size(): number {
    return this.entries.length;
  }

  get canGoBack(): boolean {
    return this.cursor > 0;
  }

  get canGoForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.entries.length - 1;
  }

  /**
   * Record a completed jump. The origin seeds an empty history or refreshes
   * its current stop (for example, after reading farther down the page).
   * A distinct destination drops the forward branch and appends one stop.
   * Returns whether a destination was appended. An identical destination
   * preserves the forward branch and does not add a redundant stop.
   */
  record(origin: T | undefined, destination: T): boolean {
    this.preserveDeparture = false;
    const departing = origin === undefined ? undefined : this.clone(origin);
    const arriving = this.clone(destination);
    this.pending = undefined;
    if (departing !== undefined) {
      if (this.cursor < 0) {
        this.entries.push(departing);
        this.cursor = 0;
      } else {
        this.entries[this.cursor] = departing;
      }
    }
    if (this.cursor >= 0 && this.equals(this.entries[this.cursor]!, arriving)) return false;
    this.entries.splice(this.cursor + 1);
    this.entries.push(arriving);
    const excess = this.entries.length - this.capacity;
    if (excess > 0) this.entries.splice(0, excess);
    this.cursor = this.entries.length - 1;
    return true;
  }

  /** Update the departure point at a navigation boundary, without adding a stop. */
  refresh(current: T): void {
    this.preserveDeparture = false;
    const entry = this.clone(current);
    this.pending = undefined;
    if (this.cursor >= 0) this.entries[this.cursor] = entry;
  }

  prepareBack(current?: T): JumpHistoryTransition<T> | undefined {
    return this.prepare(-1, current);
  }

  prepareForward(current?: T): JumpHistoryTransition<T> | undefined {
    return this.prepare(1, current);
  }

  /**
   * Commit only the latest replay after arrival. Supply the actual destination
   * if the host resolved a replacement pane or clamped a changed document.
   */
  commit(token: JumpHistoryToken, actualDestination?: T): boolean {
    if (this.pending?.token !== token) return false;
    if (actualDestination !== undefined) this.entries[this.pending.index] = this.clone(actualDestination);
    this.cursor = this.pending.index;
    this.preserveDeparture = false;
    this.pending = undefined;
    return true;
  }

  /** A failed replay leaves the cursor (and any refreshed departure point) intact. */
  cancel(token: JumpHistoryToken): boolean {
    if (this.pending?.token !== token) return false;
    this.pending = undefined;
    return true;
  }

  private prepare(direction: -1 | 1, current: T | undefined): JumpHistoryTransition<T> | undefined {
    this.pending = undefined;
    if (current !== undefined && !this.preserveDeparture) this.refresh(current);
    const index = this.cursor + direction;
    if (this.cursor < 0 || index < 0 || index >= this.entries.length) return undefined;
    const target = this.clone(this.entries[index]!);
    const token = Symbol("jump-history-replay");
    // A cancelled restore may already have moved the viewer. Keep its origin
    // until a replay commits or an explicit jump/refresh replaces the branch.
    this.preserveDeparture = true;
    this.pending = { token, index };
    return { token, target };
  }
}
