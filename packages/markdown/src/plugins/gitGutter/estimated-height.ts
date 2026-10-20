/**
 * Peek widgets draw a unified hunk. Without estimatedHeight, an off-viewport
 * rebuild reserves one line for a multi-line change.
 */
const HEADER = 40;
const ROW = 20;

/** Reserve peek height from the number of unified rows. */
export function peekEstimatedHeight(lineCount: number): number {
  return HEADER + Math.max(1, lineCount) * ROW;
}
