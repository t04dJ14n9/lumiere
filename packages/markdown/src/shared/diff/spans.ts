/**
 * Code spans on each line: a backtick run closed by the next run of the same
 * length. Linear time; a regex with a backreference backtracks badly on long
 * unmatched runs.
 */
export function codeSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  let line: { from: number; to: number }[] = [];
  const flush = () => {
    // next[i]: the next run on the line with the same length as run i.
    const next = new Array<number>(line.length).fill(-1);
    const seen = new Map<number, number>();
    for (let i = line.length - 1; i >= 0; i--) {
      const len = line[i]!.to - line[i]!.from;
      next[i] = seen.get(len) ?? -1;
      seen.set(len, i);
    }
    for (let i = 0; i < line.length;) {
      const j = next[i]!;
      if (j < 0) {
        i++;
        continue;
      }
      spans.push([line[i]!.from, line[j]!.to]);
      i = j + 1;
    }
    line = [];
  };
  for (let at = 0; at < text.length; at++) {
    const ch = text.charCodeAt(at);
    if (ch === 10) {
      flush();
    } else if (ch === 96) {
      const from = at;
      while (text.charCodeAt(at + 1) === 96) {
        at++;
      }
      line.push({ from, to: at + 1 });
    }
  }
  flush();
  return spans;
}
