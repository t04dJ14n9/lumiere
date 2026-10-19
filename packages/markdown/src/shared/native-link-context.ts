/** Mask opaque Markdown contexts while preserving every UTF-16 source offset. */
export function nativeLinkContext(text: string): string {
  let masked = text
    .replace(/<!--[\s\S]*?(?:-->|$)/g, blank)
    .replace(
      /<(script|style|pre|textarea)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
      blank,
    );
  let fence = "";
  let html = false;
  masked = masked
    .split("\n")
    .map((line) => {
      const body = containerBody(line);
      if (!body.trim()) {
        html = false;
      }
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(body);
      if (fence) {
        if (
          marker &&
          marker[1]![0] === fence[0] &&
          marker[1]!.length >= fence.length &&
          !marker[2]!.trim()
        ) {
          fence = "";
        }
        return blank(line);
      }
      if (marker) {
        fence = marker[1]!;
        return blank(line);
      }
      if (/^ {0,3}<\/?[a-z][\w-]*(?:\s|\/?>|$)/i.test(body)) {
        html = true;
      }
      return html || /^( {4}|\t)/.test(body) ? blank(line) : line;
    })
    .join("\n");
  return maskCodeSpans(masked);
}

function blank(value: string): string {
  return value.replace(/[^\r\n]/g, " ");
}

/** Quoted/list fences are still fences; their markers are not source text. */
function containerBody(line: string): string {
  let body = line;
  while (true) {
    const next = body.replace(/^ {0,3}(?:>[ \t]?|(?:[-+*]|\d+[.)])[ \t]+)/, "");
    if (next === body) {
      return body;
    }
    body = next;
  }
}

/** Exact delimiter lengths pair across lines; unmatched ticks remain literal. */
function maskCodeSpans(text: string): string {
  const runs = [...text.matchAll(/`+/g)];
  const next = new Map<number, number>();
  const later = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index--) {
    const size = runs[index]![0].length;
    const end = later.get(size);
    if (end !== undefined) {
      next.set(index, end);
    }
    later.set(size, index);
  }
  let result = "";
  let offset = 0;
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index]!;
    const close = next.get(index);
    if (close === undefined || escaped(text, run.index)) {
      continue;
    }
    const end = runs[close]!.index + run[0].length;
    result += text.slice(offset, run.index) + blank(text.slice(run.index, end));
    offset = end;
    index = close;
  }
  return result + text.slice(offset);
}

function escaped(text: string, at: number): boolean {
  let count = 0;
  while (at > 0 && text[--at] === "\\") {
    count++;
  }
  return count % 2 === 1;
}
