/** A rectangle in viewport pixels, as from getBoundingClientRect(). */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Where a footnote preview goes so it stays inside the viewport: `shift` is
 * the horizontal move from its natural place (under the reference, opening
 * rightwards), and `isAbove` opens it above the reference when it would run
 * off the bottom and there is more room above.
 */
export function fitPreview(
  preview: Box,
  reference: Box,
  viewport: { width: number; height: number },
  margin = 8,
): { shift: number; isAbove: boolean } {
  let shift = 0;
  if (preview.right > viewport.width - margin) {
    shift = viewport.width - margin - preview.right;
  }
  // A preview wider than the viewport keeps its start visible.
  if (preview.left + shift < margin) {
    shift = margin - preview.left;
  }
  const height = preview.bottom - preview.top;
  const roomBelow = viewport.height - reference.bottom;
  const isAbove =
    preview.bottom > viewport.height - margin && reference.top > roomBelow;
  return { shift, isAbove: isAbove && height > 0 };
}
