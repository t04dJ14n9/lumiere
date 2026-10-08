// Return only the checkbox marker character, leaving labels and whitespace intact.
export function taskMarker(line: string): number | undefined {
  const match = /^(?:[ \t]*>[ \t]*)*[ \t]*(?:[-+*]|\d+[.)])[ \t]+\[([^\]])\](?=\s|$)/.exec(line);
  return match ? match[0].length - 2 : undefined;
}
