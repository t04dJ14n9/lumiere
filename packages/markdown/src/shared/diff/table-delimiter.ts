/** A GFM delimiter cell has dashes, with an optional colon at either end. */
function isDelimiterCell(cell: string): boolean {
  const text = cell.trim();
  let at = text.startsWith(":") ? 1 : 0;
  const start = at;
  while (text[at] === "-") {
    at++;
  }
  if (at === start) {
    return false;
  }
  if (text[at] === ":") {
    at++;
  }
  return at === text.length;
}

/**
 * Recognize a delimiter row in linear time. Separate trimming and cell scans
 * avoid overlapping whitespace quantifiers on deeply indented note text.
 */
export function isSeparator(line: string): boolean {
  const text = line.trim();
  const start = text.startsWith("|") ? 1 : 0;
  const end = text.endsWith("|") ? text.length - 1 : text.length;
  return text
    .slice(start, Math.max(start, end))
    .split("|")
    .every(isDelimiterCell);
}
