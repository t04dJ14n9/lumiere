/**
 * Locate an Obsidian-style YAML frontmatter fence without loading the YAML
 * package. Callers that only need the body span (or a no-fence fast path)
 * stay off the YAML runtime.
 */
export function headerParts(source: string) {
  const opening = /^---\r?\n/.exec(source);
  if (!opening) {
    return undefined;
  }
  const rest = source.slice(opening[0].length);
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) {
    return undefined;
  }
  const offset = opening[0].length;
  const body = rest.slice(0, closing.index);
  const end = offset + closing.index + closing[0].length;
  return {
    body,
    offset,
    end,
    raw: source.slice(0, end),
    eol: opening[0].endsWith("\r\n") ? "\r\n" : "\n",
  };
}
