/** Most extra detail rendered for a zoomed-out page. */
const LOW_ZOOM_PIXEL_RATIO_CAP = 3;
/** Keep one page bitmap within a safe memory budget. */
const MAX_PAGE_PIXELS = 16 * 1024 * 1024;

/**
 * Pixel ratio for rendering one page.
 *
 * A zoomed-out page is rendered with extra detail (up to 3x) so it stays
 * sharp while the reader zooms in and the next render is on its way. The
 * ratio is then capped so a page never exceeds `MAX_PAGE_PIXELS`.
 */
export function renderPixelRatio(
  scale: number,
  devicePixelRatio: number,
  width: number,
  height: number,
): number {
  const display = Math.max(1, devicePixelRatio);
  const detailForFullZoom = display / Math.max(0.01, scale);
  const wanted = Math.max(
    display,
    Math.min(LOW_ZOOM_PIXEL_RATIO_CAP, detailForFullZoom),
  );
  const budget = Math.sqrt(MAX_PAGE_PIXELS / Math.max(1, width * height));
  return Math.max(0.1, Math.min(wanted, budget));
}
