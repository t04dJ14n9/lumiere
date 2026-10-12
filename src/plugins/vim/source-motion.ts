interface Position {
  line: number;
  ch: number;
}

interface WidgetLines {
  kind: string;
  from: number;
  to: number;
}

interface SourceMotion {
  start: Position;
  amount: number;
  result: Position;
  lastLine: number;
  goalColumn: number;
  lineLength(line: number): number;
  widgets: readonly WidgetLines[];
  /** Fold anchor line through its last hidden line, disjoint and source ordered. */
  folds?: readonly { from: number; to: number }[];
  policy?: "source" | "display-entry";
}

/**
 * CM's vertical layout can skip a table replacement. Vim's source motions
 * must ignore that overshoot, including operators and visual selections.
 */
export function tableMotionPosition(
  motion: SourceMotion,
): Position | undefined {
  const { start, amount, result, lastLine, widgets } = motion;
  const line = foldedSourceLine(
    start.line,
    amount,
    lastLine,
    motion.folds ?? [],
  );
  const direction = Math.sign(amount);
  if (!direction || direction * (result.line - line) <= 0) {
    return undefined;
  }
  const from = Math.min(start.line, result.line);
  const to = Math.max(start.line, result.line);
  // Display motion only enters an adjacent table in one step. Its column is
  // the adapter result after pixel-goal resolution; counts and wrapping keep
  // native layout semantics instead of becoming source-line arithmetic.
  if (
    motion.policy === "display-entry" &&
    (Math.abs(amount) !== 1 ||
      !widgets.some(
        (widget) =>
          widget.kind === "Table" && widget.from <= line && widget.to >= line,
      ))
  ) {
    return undefined;
  }
  if (
    !widgets.some(
      (widget) =>
        widget.kind === "Table" && widget.from <= to && widget.to >= from,
    )
  ) {
    return undefined;
  }
  // moveByLines uses this column directly when a fold still overshoots its
  // arithmetic target. Display motions must retain the adapter's pixel goal.
  return {
    line,
    ch: Math.max(0, Math.min(motion.lineLength(line), motion.goalColumn)),
  };
}

function foldedSourceLine(
  start: number,
  amount: number,
  lastLine: number,
  folds: readonly { from: number; to: number }[],
): number {
  let line = start + amount;
  const forward = amount > 0;
  for (const fold of forward ? folds : [...folds].reverse()) {
    const crosses = forward
      ? start <= fold.from && line > fold.from
      : start > fold.to && line <= fold.to;
    if (crosses) {
      line += (forward ? 1 : -1) * (fold.to - fold.from);
    }
  }
  return Math.max(0, Math.min(lastLine, line));
}
