/**
 * The change to show after `current` moving by `direction`, wrapping. With
 * nothing selected (-1, or past the end after a refresh) Next is the first
 * change and Previous the last. -1 when there are none.
 */
export function stepChange(
  current: number,
  direction: 1 | -1,
  length: number,
): number {
  if (length === 0) {
    return -1;
  }
  if (current < 0 || current >= length) {
    return direction === 1 ? 0 : length - 1;
  }
  return (current + direction + length) % length;
}
