/**
 * Beyond these sizes on either side the git diff plugins show nothing (as in
 * VS Code's diff limits): the baseline is refused before it is cached or sent.
 */
export const MAX_DIFF_CHARS = 1_000_000;
export const MAX_DIFF_LINES = 20_000;

/** Whether a text is past the diff limits, counting lines only up to the cap. */
export function exceedsDiffLimits(text: string): boolean {
  if (text.length > MAX_DIFF_CHARS) {
    return true;
  }
  let lines = 1;
  for (
    let at = text.indexOf("\n");
    at !== -1;
    at = text.indexOf("\n", at + 1)
  ) {
    if (++lines > MAX_DIFF_LINES) {
      return true;
    }
  }
  return false;
}
