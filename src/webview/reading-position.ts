import type { ZoomLevel } from '@embedpdf/plugin-zoom/react';

/**
 * Where the reader is: the page at the top of the viewer, how far down it
 * (in points), and the zoom (a level, or a mode such as fit-width).
 *
 * The viewer restarts when the file changes on disk; the position is kept
 * here, outside React, so the new viewer opens where the reader was, as a
 * PDF rebuilt from LaTeX should.
 */
export interface ReadingPosition {
  page: number;
  top: number;
  zoom: ZoomLevel;
}

let last: ReadingPosition | undefined;

export function rememberPosition(position: ReadingPosition): void {
  last = position;
}

/** The position of the previous viewer of this file, if there was one. */
export function rememberedPosition(): ReadingPosition | undefined {
  return last;
}
