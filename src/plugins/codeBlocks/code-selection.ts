/** Translate a click in highlighted code back to the original Markdown. */
export function codePosition(
  source: string,
  code: HTMLElement,
  event: MouseEvent,
  fenced: boolean,
): number | undefined {
  const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
  if (!caret || !code.contains(caret.startContainer)) {
    return undefined;
  }
  const before = document.createRange();
  before.selectNodeContents(code);
  before.setEnd(caret.startContainer, caret.startOffset);
  const selected = before.toString().split("\n");
  const row = selected.length - 1;
  const column = selected[row]!.length;
  return codeOffset({
    source,
    text: code.textContent ?? "",
    row,
    column,
    fenced,
  });
}

interface CodeCoordinates {
  source: string;
  text: string;
  row: number;
  column: number;
  fenced: boolean;
}

export function codeOffset({
  source,
  text,
  row,
  column,
  fenced,
}: CodeCoordinates): number | undefined {
  const lines = source.split("\n");
  const lineIndex = row + (fenced ? 1 : 0);
  const raw = lines[lineIndex];
  const rendered = text.split("\n")[row];
  if (raw === undefined || rendered === undefined) {
    return undefined;
  }
  // Markdown may remove indentation before Prism wraps individual tokens.
  const indentation = raw.indexOf(rendered);
  if (indentation < 0) {
    return undefined;
  }
  return (
    lines
      .slice(0, lineIndex)
      .reduce((offset, line) => offset + line.length + 1, 0) +
    indentation +
    column
  );
}
