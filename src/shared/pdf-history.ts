import { parseReadingPosition, type ReadingPosition } from './reading-position';

/** Shared envelope; the anchor remains specific to each document kind. */
export interface PdfHistoryEntry {
  kind: 'pdf';
  uri: string;
  anchor: ReadingPosition;
}

/** Binds a host round trip to the viewport intent sampled before departure. */
export interface HistorySnapshot {
  position: ReadingPosition;
  intent: number;
  previousRestoreStarted?: boolean;
}

export function samePosition(a: ReadingPosition, b: ReadingPosition): boolean {
  return a.page === b.page && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
    && a.zoom === b.zoom && a.pageLayout === b.pageLayout
    && a.scrollMode === b.scrollMode && a.scrollDirection === b.scrollDirection;
}

export function sameHistoryEntry(a: PdfHistoryEntry, b: PdfHistoryEntry): boolean {
  return a.kind === b.kind && a.uri === b.uri && samePosition(a.anchor, b.anchor);
}

export function cloneHistoryEntry(entry: PdfHistoryEntry): PdfHistoryEntry {
  return { ...entry, anchor: { ...entry.anchor } };
}

export function parseHistoryPosition(value: unknown): ReadingPosition | undefined {
  return parseReadingPosition(value);
}
