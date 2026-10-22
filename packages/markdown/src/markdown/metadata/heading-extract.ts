import type { Tree } from "@lezer/common";

export interface Heading {
  from: number;
  to: number;
  end: number;
  level: number;
  label: string;
  key: string;
  scope: string;
}

/**
 * Plain text of a heading line the way markdown-it's inline parse used to:
 * keep text / inline-code / image alt content, drop other markup, then expand
 * wikilink aliases. Avoids loading markdown-it on the extension host.
 */
export function headingLabel(text: string): string {
  return stripInlineMarkup(text).replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_all, target: string, alias?: string) => alias ?? target,
  );
}

function stripInlineMarkup(text: string): string {
  let label = "";
  let index = 0;
  while (index < text.length) {
    const next = takeInline(text, index);
    label += next.text;
    index = next.index;
  }
  return label;
}

function takeInline(
  text: string,
  index: number,
): { text: string; index: number } {
  const image = takeDelimited({
    text,
    index,
    open: "![",
    mid: "]",
    beforeUrl: "(",
  });
  if (image) {
    return image;
  }
  const code = takeWrapped(text, index, "`");
  if (code) {
    return code;
  }
  const emphasis = takeEmphasis(text, index);
  if (emphasis) {
    return emphasis;
  }
  const link = takeDelimited({
    text,
    index,
    open: "[",
    mid: "]",
    beforeUrl: "(",
  });
  if (link) {
    return { text: stripInlineMarkup(link.text), index: link.index };
  }
  if (text[index] === "<") {
    const end = text.indexOf(">", index + 1);
    if (end >= 0) {
      return { text: "", index: end + 1 };
    }
  }
  if (text[index] === "\\" && index + 1 < text.length) {
    return { text: text[index + 1]!, index: index + 2 };
  }
  return { text: text[index]!, index: index + 1 };
}

function takeWrapped(
  text: string,
  index: number,
  marker: string,
): { text: string; index: number } | undefined {
  if (text[index] !== marker) {
    return undefined;
  }
  const close = text.indexOf(marker, index + 1);
  if (close < 0) {
    return undefined;
  }
  return { text: text.slice(index + 1, close), index: close + 1 };
}

function takeEmphasis(
  text: string,
  index: number,
): { text: string; index: number } | undefined {
  const marker = text[index];
  if (marker !== "*" && marker !== "_" && marker !== "~") {
    return undefined;
  }
  let length = 1;
  while (text[index + length] === marker) {
    length++;
  }
  const close = text.indexOf(marker.repeat(length), index + length);
  if (close < 0) {
    return undefined;
  }
  return {
    text: stripInlineMarkup(text.slice(index + length, close)),
    index: close + length,
  };
}

/** `![alt](url)` or `[label](url)` — returns the inner label/alt span. */
function takeDelimited(options: {
  text: string;
  index: number;
  open: string;
  mid: string;
  beforeUrl: string;
}): { text: string; index: number } | undefined {
  const { text, index, open, mid, beforeUrl } = options;
  if (!text.startsWith(open, index)) {
    return undefined;
  }
  const close = text.indexOf(mid, index + open.length);
  if (close < 0 || text[close + 1] !== beforeUrl) {
    return undefined;
  }
  const end = text.indexOf(")", close + 2);
  if (end < 0) {
    return undefined;
  }
  return {
    text: text.slice(index + open.length, close),
    index: end + 1,
  };
}

export function extractHeadings(source: string, tree: Tree): Heading[] {
  const result: Heading[] = [];
  const counts = new Map<string, number>();
  tree.iterate({
    enter(node) {
      const match = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
      // As in Obsidian, only a note's own headings count: not one inside a
      // list item, quote or callout.
      if (!match || node.node.parent?.name !== "Document") {
        return;
      }
      const text = source
        .slice(node.from, node.to)
        .split("\n")[0]!
        .replace(/\r$/, "")
        .replace(/^#{1,6}\s+/, "")
        .replace(/\s+#+\s*$/, "");
      const label = headingLabel(text);
      const base = `${match[1]}:${label}`;
      const count = counts.get(base) ?? 0;
      counts.set(base, count + 1);
      const parent = node.node.parent;
      result.push({
        from: node.from,
        to: node.to,
        end: parent?.to ?? source.length,
        level: Number(match[1]),
        label,
        key: `${base}:${count}`,
        scope: `${parent?.from}:${parent?.to}`,
      });
    },
  });
  result.forEach((heading, index) => {
    const next = result
      .slice(index + 1)
      .find(
        (other) =>
          other.scope === heading.scope && other.level <= heading.level,
      );
    if (next) {
      heading.end = Math.max(heading.to, next.from - 1);
    }
  });
  return result;
}
