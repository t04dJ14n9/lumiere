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

/** Ignore transient native offsets outside the selected page's panning bounds. */
export function pageAxisState(
  offset: number,
  bounds: { min: number; max: number },
): { position: number; before: number; after: number } {
  const position = Math.min(bounds.max, Math.max(bounds.min, offset));
  return {
    position,
    before: position - bounds.min,
    after: bounds.max - position,
  };
}
