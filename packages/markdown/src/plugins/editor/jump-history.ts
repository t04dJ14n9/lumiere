/** A small location envelope that can later participate in a shared navigator. */
export interface MarkdownLocation {
  kind: "markdown";
  uri: string;
  anchor: JumpAnchor;
}
export interface JumpAnchor {
  selection: { anchor: number; head: number };
  scroll: { from: number; offset: number; left: number; top: number };
}
export interface JumpPlan {
  readonly revision: number;
  readonly index: number;
  readonly location: MarkdownLocation;
  readonly departure: MarkdownLocation;
}

/** One document in one pane. Cursor changes only after an acknowledged restore. */
export class JumpHistory {
  private entries: MarkdownLocation[] = [];
  private index = -1;
  private revision = 0;
  private departure: MarkdownLocation | undefined;
  constructor(private readonly limit = 100) {
    if (!Number.isInteger(limit) || limit < 2) {
      throw new Error("Invalid history limit");
    }
  }
  get hasDeparture(): boolean {
    return this.departure !== undefined;
  }
  releaseDeparture(): void {
    this.departure = undefined;
  }
  get canBack(): boolean {
    return this.index > 0;
  }
  get canForward(): boolean {
    return this.index + 1 < this.entries.length;
  }
  get size(): number {
    return this.entries.length;
  }

  record(before: MarkdownLocation, after: MarkdownLocation): void {
    if (before.uri !== after.uri || samePosition(before, after)) {
      return;
    }
    this.departure = undefined;
    this.revision++;
    this.entries.splice(this.index + 1);
    if (this.index < 0) {
      this.entries.push(before);
    } else {
      this.entries[this.index] = before;
    }
    this.entries.push(after);
    if (this.entries.length > this.limit) {
      this.entries.shift();
    }
    this.index = this.entries.length - 1;
  }
  plan(direction: -1 | 1, departure: MarkdownLocation): JumpPlan | undefined {
    const index = this.index + direction;
    const location = this.entries[index];
    if (!location || location.uri !== departure.uri) {
      return undefined;
    }
    return {
      revision: this.revision,
      index,
      location,
      departure: this.departure ?? departure,
    };
  }
  /** Preserve the origin even if a restore moves but never acknowledges. */
  attempt(plan: JumpPlan): void {
    if (plan.revision === this.revision) {
      this.departure ??= plan.departure;
    }
  }
  commit(plan: JumpPlan): boolean {
    if (
      plan.revision !== this.revision ||
      this.entries[plan.index] !== plan.location
    ) {
      return false;
    }
    // Ordinary scrolling changes the departing view, never the length of history.
    this.entries[this.index] = plan.departure;
    this.departure = undefined;
    this.index = plan.index;
    this.revision++;
    return true;
  }
  map(transform: (location: MarkdownLocation) => MarkdownLocation): void {
    this.entries = this.entries.map(transform);
    if (this.departure) {
      this.departure = transform(this.departure);
    }
    this.revision++;
  }
  clear(): void {
    this.entries = [];
    this.departure = undefined;
    this.index = -1;
    this.revision++;
  }
}

function samePosition(a: MarkdownLocation, b: MarkdownLocation): boolean {
  return (
    a.uri === b.uri &&
    a.anchor.selection.anchor === b.anchor.selection.anchor &&
    a.anchor.selection.head === b.anchor.selection.head
  );
}

export function mapAnchor(
  anchor: JumpAnchor,
  map: (at: number) => number,
): JumpAnchor {
  return {
    selection: {
      anchor: map(anchor.selection.anchor),
      head: map(anchor.selection.head),
    },
    scroll: { ...anchor.scroll, from: map(anchor.scroll.from) },
  };
}

/** Changes refer to the previous source, including CRLF. Deleted targets clamp. */
export function mapSourceOffset(
  at: number,
  changes: readonly { from: number; to: number; insert: string }[],
): number {
  let delta = 0;
  for (const change of [...changes].sort((a, b) => a.from - b.from)) {
    if (at < change.from) {
      break;
    }
    if (at <= change.to) {
      return change.from + delta + change.insert.length;
    }
    delta += change.insert.length - (change.to - change.from);
  }
  return at + delta;
}
