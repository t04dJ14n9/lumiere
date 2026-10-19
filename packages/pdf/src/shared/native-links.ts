import { nativeLinkContext } from "./native-link-context";
/** Conservative inline Markdown links. Unsupported syntax stays with the host. */
export interface NativeLink {
  from: number;
  to: number;
  href: string;
}

export function nativeLinks(text: string): NativeLink[] {
  if (text.length > 2_000_000) {
    return [];
  }
  const result: NativeLink[] = [];
  let offset = 0;
  for (const line of nativeLinkContext(text).split("\n")) {
    result.push(...inlineLinks(line, offset));
    offset += line.length + 1;
  }
  return result;
}

function inlineLinks(line: string, offset: number): NativeLink[] {
  const result: NativeLink[] = [];
  const labels = /(?<!!)\[[^\]\n[]*\]\(\s*/g;
  for (const match of line.matchAll(labels)) {
    if (escaped(line, match.index)) {
      continue;
    }
    const start = match.index + match[0].length;
    const end = destinationEnd(line, start);
    if (end === undefined) {
      continue;
    }
    const angle = line[start] === "<";
    const from = start + (angle ? 1 : 0);
    const to = end - (angle ? 1 : 0);
    const tail = line.slice(end);
    if (!/^\s*(?:["'][^\n]*?["']\s*)?\)/.test(tail)) {
      continue;
    }
    const href = line
      .slice(from, to)
      .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1");
    // Entities require a complete HTML entity parser; leave them to the host.
    if (/&(?:#\w+|\w+);/.test(href)) {
      continue;
    }
    result.push({ from: offset + from, to: offset + to, href });
  }
  return result;
}

function escaped(text: string, at: number): boolean {
  let count = 0;
  while (at > 0 && text[--at] === "\\") {
    count++;
  }
  return count % 2 === 1;
}

function destinationEnd(line: string, start: number): number | undefined {
  const angle = line[start] === "<";
  let depth = 0;
  for (let at = start + (angle ? 1 : 0); at < line.length; at++) {
    if (escaped(line, at)) {
      continue;
    }
    const char = line[at];
    if (angle && char === ">") {
      return at + 1;
    }
    if (angle) {
      continue;
    }
    if (char === "(") {
      depth++;
    }
    if (char === ")" && depth-- === 0) {
      return at;
    }
    if (/\s/.test(char ?? "")) {
      return at;
    }
  }
  return undefined;
}

/** Decode once, after separating the fragment; encoded # remains a filename. */
export function localFragment(
  href: string,
): { path: string; fragment: string } | undefined {
  const hash = href.indexOf("#");
  if (hash < 0 || hash === href.length - 1) {
    return undefined;
  }
  try {
    const path = decodeURIComponent(href.slice(0, hash));
    const fragment = href.slice(hash + 1);
    decodeURIComponent(fragment);
    if (
      /^[a-z][\w+.-]*:/i.test(path) ||
      path.startsWith("//") ||
      path.includes("\\") ||
      [...path, ...decodeURIComponent(fragment)].some(
        (char) => char.charCodeAt(0) < 32,
      )
    ) {
      return undefined;
    }
    return { path, fragment };
  } catch {
    return undefined;
  }
}
