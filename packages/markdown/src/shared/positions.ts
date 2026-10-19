/** Index of the first sorted source position at or after the requested offset. */
export function lowerBound(
  positions: readonly number[],
  offset: number,
): number {
  let from = 0;
  let to = positions.length;
  while (from < to) {
    const middle = (from + to) >>> 1;
    if (positions[middle]! < offset) {
      from = middle + 1;
    } else {
      to = middle;
    }
  }
  return from;
}
