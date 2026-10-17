/** A rectangle in viewport pixels, as from getBoundingClientRect(). */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const PREVIEW_GAP = 12;

/**
 * Where a fixed-position footnote preview goes so it stays inside the
 * viewport. Opens under the reference (opening rightwards from its left),
 * moves left at the right edge, and opens above when it would run off the
 * bottom and there is more room above.
 *
 * Fixed positioning is required: an absolute preview inside the reference was
 * clipped by `#app .cm-scroller { overflow: auto }`, so hover content looked
 * truncated near tables and toward the bottom of the note.
 */
export function placePreview(
  size: { width: number; height: number },
  reference: Box,
  viewport: { width: number; height: number },
  margin = 8,
): { left: number; top: number; isAbove: boolean } {
  let left = reference.left - 4;
  if (left + size.width > viewport.width - margin) {
    left = viewport.width - margin - size.width;
  }
  // A preview wider than the viewport keeps its start visible.
  if (left < margin) {
    left = margin;
  }
  const roomBelow = viewport.height - reference.bottom;
  const roomAbove = reference.top;
  const isAbove =
    size.height > 0 &&
    reference.bottom + PREVIEW_GAP + size.height > viewport.height - margin &&
    roomAbove > roomBelow;
  const top = isAbove
    ? Math.max(margin, reference.top - PREVIEW_GAP - size.height)
    : reference.bottom + PREVIEW_GAP;
  return { left, top, isAbove };
}
