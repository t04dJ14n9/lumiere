import type { LineRecord } from "./types";

export interface UnifiedRow {
  readonly kind: LineRecord["kind"];
  readonly original?: number;
  readonly modified?: number;
  readonly text: string;
}

/** Raw unified rows: comparison line numbers and the hunk text, never rendered Markdown. */
export function unifiedRows(lines: readonly LineRecord[]): UnifiedRow[] {
  return lines.map((line) => ({
    kind: line.kind,
    ...(line.originalLine !== undefined ? { original: line.originalLine } : {}),
    ...(line.modifiedLine !== undefined ? { modified: line.modifiedLine } : {}),
    text: line.text,
  }));
}
