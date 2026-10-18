/**
 * An image embed's size in its source, as Obsidian writes it: the last `|`
 * part of a wikilink embed (`![[a.png|100]]`), or of a Markdown image's alt
 * text (`![alt|100](a.png)`, `![100](a.png)`).
 */
const SIZE = /^\d+(?:x\d+)?$/u;

interface Parts {
  /** Where the part holding the size, or the alt text, starts and ends. */
  from: number;
  to: number;
  parts: string[];
  /** The image's target: the file it shows. */
  target: { from: number; to: number };
  wiki: boolean;
}

function partsOf(source: string): Parts | undefined {
  const wiki = /^!\[\[([^\]]*)\]\]$/u.exec(source);
  if (wiki) {
    const inner = wiki[1]!;
    const target = inner.split("|")[0]!.replace(/[#^].*$/u, "");
    return {
      from: 3,
      to: 3 + inner.length,
      parts: inner.split("|"),
      target: { from: 3, to: 3 + target.length },
      wiki: true,
    };
  }
  const markdown = /^!\[([^\]]*)\]\(\s*<?([^)>\s]*)/u.exec(source);
  if (markdown) {
    const alt = markdown[1]!;
    const at = source.indexOf(markdown[2]!, 2 + alt.length);
    return {
      from: 2,
      to: 2 + alt.length,
      parts: alt.split("|"),
      target: { from: at, to: at + markdown[2]!.length },
      wiki: false,
    };
  }
  return undefined;
}

/** The width written in `source`, if any. */
export function writtenWidth(source: string): number | undefined {
  const last = partsOf(source)?.parts.at(-1);
  return last && SIZE.test(last) ? Number(last.split("x")[0]) : undefined;
}

/** `source` with its size set to `width`, or removed for `undefined`. */
export function withWidth(source: string, width: number | undefined): string {
  const found = partsOf(source);
  if (!found) {
    return source;
  }
  const parts = [...found.parts];
  const sized = SIZE.test(parts.at(-1) ?? "") && parts.length > 1;
  const altSize = !found.wiki && parts.length === 1 && SIZE.test(parts[0]!);
  if (sized || altSize) {
    parts.pop();
  }
  if (width !== undefined) {
    if (!found.wiki && parts.length === 1 && parts[0] === "") {
      parts[0] = String(width);
    } else {
      parts.push(String(width));
    }
  }
  const inner = parts.length === 0 ? "" : parts.join("|");
  return source.slice(0, found.from) + inner + source.slice(found.to);
}

/** Where the file name is in `source`, which Enter selects. */
export function targetRange(
  source: string,
): { from: number; to: number } | undefined {
  return partsOf(source)?.target;
}

/** Where a size goes in `source`, where Tab puts the caret. */
export function sizeOffset(source: string): number | undefined {
  return partsOf(source)?.to;
}

/**
 * The next width a step takes, as Obsidian 1.13 resizes: up to the next
 * multiple of 25 (at most `max`), or down to the one before (at least 25).
 */
export function steppedWidth(
  current: number,
  direction: 1 | -1,
  max: number,
): number {
  const from = Math.min(current, max);
  if (direction === 1) {
    return Math.min(max, (Math.floor(from / 25) + 1) * 25);
  }
  return Math.max(25, (Math.ceil(from / 25) - 1) * 25);
}
