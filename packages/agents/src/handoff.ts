/**
 * The text Copy Link for Agent writes for a note selection, as
 * docs/agent-handoff-format.md defines it: Markdown Workshop writes it, and
 * PDF Workshop's agent bridge returns it for the note selection.
 */

/** `@notes/a.md#12-18` (one line: `#12`), with the full URI outside the workspace folder. */
export function noteReference(
  path: string,
  startLine: number,
  endLine: number,
  isDirty: boolean,
): string {
  const lines =
    startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
  return isDirty ? `${path} (unsaved, lines ${lines})` : `@${path}#${lines}`;
}

/** The reference, a blank line, then the selection quoted line by line with `> `. */
export function notePayload(reference: string, text: string): string {
  const lines = text.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "").split("\n");
  return `${reference}\n\n${lines.map((line) => (line ? `> ${line}` : ">")).join("\n")}`;
}
