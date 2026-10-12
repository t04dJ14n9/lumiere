/**
 * Myers' O(ND) difference over two sequences (An O(ND) Difference Algorithm
 * and Its Variations, 1986). Shared by the git diff plugins; pure, so both
 * runtimes and `tsx --test` load it.
 */
export interface Span {
  /** Half-open ranges into the old (`a`) and new (`b`) sequences. */
  readonly aFrom: number;
  readonly aTo: number;
  readonly bFrom: number;
  readonly bTo: number;
}
export interface Run extends Span {
  readonly type: "equal" | "delete" | "insert";
}

/** Above this many edits the middle is reported as one replacement. */
export const MAX_EDITS = 4000;

type Equal<T> = (x: T, y: T) => boolean;

/** Runs in order, with neighbours of one type merged. */
class Runs {
  readonly list: Run[] = [];
  add(type: Run["type"], span: Span): void {
    if (span.aFrom === span.aTo && span.bFrom === span.bTo) {
      return;
    }
    const last = this.list.at(-1);
    if (
      last?.type === type &&
      last.aTo === span.aFrom &&
      last.bTo === span.bFrom
    ) {
      this.list[this.list.length - 1] = {
        ...last,
        type,
        aTo: span.aTo,
        bTo: span.bTo,
      };
      return;
    }
    this.list.push({ type, ...span });
  }
}

export function diffSequences<T>(
  a: readonly T[],
  b: readonly T[],
  equal: Equal<T> = (x, y) => x === y,
  maxEdits = MAX_EDITS,
): Run[] {
  let start = 0;
  while (start < a.length && start < b.length && equal(a[start]!, b[start]!)) {
    start++;
  }
  let aEnd = a.length;
  let bEnd = b.length;
  while (aEnd > start && bEnd > start && equal(a[aEnd - 1]!, b[bEnd - 1]!)) {
    aEnd--;
    bEnd--;
  }
  const runs = new Runs();
  runs.add("equal", { aFrom: 0, aTo: start, bFrom: 0, bTo: start });
  const middle = { aFrom: start, aTo: aEnd, bFrom: start, bTo: bEnd };
  for (const run of middleRuns({ a, b, equal }, middle, maxEdits)) {
    runs.add(run.type, run);
  }
  runs.add("equal", { aFrom: aEnd, aTo: a.length, bFrom: bEnd, bTo: b.length });
  return runs.list;
}

interface Input<T> {
  readonly a: readonly T[];
  readonly b: readonly T[];
  readonly equal: Equal<T>;
}

function middleRuns<T>(input: Input<T>, span: Span, maxEdits: number): Run[] {
  const n = span.aTo - span.aFrom;
  const m = span.bTo - span.bFrom;
  if (n === 0 || m === 0) {
    return [{ type: n === 0 ? "insert" : "delete", ...span }];
  }
  const trace = forward(input, span, Math.min(n + m, maxEdits));
  if (!trace) {
    return [
      { type: "delete", ...span, bTo: span.bFrom },
      { type: "insert", ...span, aFrom: span.aTo },
    ];
  }
  return backtrack(trace, span);
}

/** The furthest-reaching paths for each edit count, up to the one reaching the end. */
function forward<T>(
  { a, b, equal }: Input<T>,
  span: Span,
  max: number,
): Int32Array[] | undefined {
  const n = span.aTo - span.aFrom;
  const m = span.bTo - span.bFrom;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = down(v, offset, k, d)
        ? v[offset + k + 1]!
        : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && equal(a[span.aFrom + x]!, b[span.bFrom + y]!)) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        return trace;
      }
    }
  }
  return undefined;
}

const down = (v: Int32Array, offset: number, k: number, d: number) =>
  k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!);

function backtrack(trace: readonly Int32Array[], span: Span): Run[] {
  const offset = (trace[0]!.length - 3) / 2 + 1;
  const steps: Run[] = [];
  const step = (type: Run["type"], x: number, y: number) =>
    steps.push({
      type,
      aFrom: span.aFrom + x,
      aTo: span.aFrom + x + (type === "insert" ? 0 : 1),
      bFrom: span.bFrom + y,
      bTo: span.bFrom + y + (type === "delete" ? 0 : 1),
    });
  let x = span.aTo - span.aFrom;
  let y = span.bTo - span.bFrom;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d]!;
    const k = x - y;
    const prevK = down(v, offset, k, d) ? k + 1 : k - 1;
    const prevX = v[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      step("equal", --x, --y);
    }
    if (x === prevX) {
      step("insert", x, --y);
    } else {
      step("delete", --x, y);
    }
  }
  while (x > 0 && y > 0) {
    step("equal", --x, --y);
  }
  const runs = new Runs();
  for (const run of steps.reverse()) {
    runs.add(run.type, run);
  }
  return runs.list;
}
