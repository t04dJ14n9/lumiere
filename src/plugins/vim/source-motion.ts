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
}

/**
 * CM's vertical layout can skip a table replacement. Vim's source motions
 * must ignore that overshoot, including operators and visual selections.
 */
export function tableMotionPosition(
  motion: SourceMotion,
): Position | undefined {
  const { start, amount, result, lastLine, widgets } = motion;
  const line = Math.max(0, Math.min(lastLine, start.line + amount));
  const direction = Math.sign(amount);
  if (!direction || direction * (result.line - line) <= 0) {
    return undefined;
  }
  const from = Math.min(start.line, result.line);
  const to = Math.max(start.line, result.line);
  if (
    !widgets.some(
      (widget) =>
        widget.kind === "Table" && widget.from <= to && widget.to >= from,
    )
  ) {
    return undefined;
  }
  // gj/gk use ch directly; j/k retain lastHPos when the result no longer overshoots.
  return {
    line,
    ch: Math.max(0, Math.min(motion.lineLength(line), motion.goalColumn)),
  };
}
