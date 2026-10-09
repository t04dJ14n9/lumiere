/**
 * The text Markdown Workbench's Copy Link for Agent writes for a note
 * selection; its public API does not build it, so the bridge does. Both
 * extensions follow docs/agent-handoff-format.md (kept identical in both
 * repositories, checked against test/fixtures/agent-handoff-format.json).
 */

/** `@notes/a.md#12-18` (one line: `#12`), with the full URI outside the workspace folder. */
export function noteReference(path: string, startLine: number, endLine: number, isDirty: boolean): string {
  const lines = startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
  return isDirty ? `${path} (unsaved, lines ${lines})` : `@${path}#${lines}`;
}

/** The reference, a blank line, then the selection quoted line by line with `> `. */
export function notePayload(reference: string, text: string): string {
  const lines = text.replace(/\r\n?/gu, '\n').replace(/\n+$/u, '').split('\n');
  return `${reference}\n\n${lines.map(line => (line ? `> ${line}` : '>')).join('\n')}`;
}
