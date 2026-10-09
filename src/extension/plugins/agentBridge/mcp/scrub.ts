/**
 * A function that replaces a secret in text, in the forms it takes when an
 * error message or log line quotes it: as is, URL-encoded (also every
 * character percent-encoded), JSON-escaped, and in either letter case of its
 * hex form. The `/mcp/<token>` path form contains the raw token, so it is
 * covered by the first.
 */
export function tokenScrubber(token: string, label = '<token>'): (text: string) => string {
  const percentAll = [...token].map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
  const forms = new Set([
    token,
    encodeURIComponent(token),
    JSON.stringify(token).slice(1, -1),
    percentAll,
    percentAll.toUpperCase(),
    token.toUpperCase(),
  ]);
  // Longest first, so a form that contains another is replaced whole.
  const ordered = [...forms].filter(Boolean).sort((a, b) => b.length - a.length);
  return text => ordered.reduce((result, form) => result.replaceAll(form, label), text);
}
