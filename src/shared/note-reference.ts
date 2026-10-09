/**
 * The reference Markdown Workbench's Copy Link for Agent writes: `@notes/a.md#12-18`
 * (one line: `#12`), with the full URI outside the workspace folder. Its public
 * API does not build it, so the bridge does.
 */
export function noteReference(path: string, startLine: number, endLine: number, isDirty: boolean): string {
  const lines = startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
  return isDirty ? `${path} (unsaved, lines ${lines})` : `@${path}#${lines}`;
}
