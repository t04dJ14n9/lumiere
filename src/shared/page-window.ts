/** Restrict panning to one native layout item, including its surrounding padding. */
export function pageAxisBounds(
  start: number,
  size: number,
  visible: number,
  total: number,
): { min: number; max: number } {
  const documentMax = Math.max(0, total - visible);
  const min = Math.min(documentMax, Math.max(0, start));
  return {
    min,
    max: Math.max(min, Math.min(documentMax, start + size - visible)),
  };
}
