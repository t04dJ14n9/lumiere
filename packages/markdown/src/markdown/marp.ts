import { headerParts } from "./properties/frontmatter";

/**
 * Marp for VS Code treats a Markdown file as a deck when frontmatter at the
 * start of the file contains `marp: true` (the value is exactly `true`).
 * The pattern matches marp-vscode's own check.
 */
const MARP_LINE = /^(marp\s*: +)(.*)\s*$/m;

export function isMarpDocument(source: string): boolean {
  const text = stripBom(source);
  const header = headerParts(text);
  if (!header || !closedWithFence(header.raw)) {
    return false;
  }
  const line = MARP_LINE.exec(header.body);
  return line?.[2] === "true";
}

/** Insert or flip the `marp` flag. Other frontmatter bytes stay put. */
export function setMarpEnabled(source: string, enabled: boolean): string {
  const bom = source.charCodeAt(0) === 0xfeff ? "\uFEFF" : "";
  const text = bom ? source.slice(1) : source;
  const header = headerParts(text);
  if (!header) {
    if (!enabled) {
      return source;
    }
    return `${bom}---\nmarp: true\n---\n\n${text}`;
  }
  const body = rewriteMarpLine(header.body, enabled, header.eol);
  if (body === header.body) {
    return source;
  }
  const closingAt = header.offset + header.body.length;
  return bom + text.slice(0, header.offset) + body + text.slice(closingAt);
}

function rewriteMarpLine(body: string, enabled: boolean, eol: string): string {
  const value = enabled ? "true" : "false";
  const line = MARP_LINE.exec(body);
  if (!line) {
    if (!enabled) {
      return body;
    }
    const inserted = `marp: ${value}`;
    return body.length === 0 ? inserted : `${inserted}${eol}${body}`;
  }
  if (line[2] === value) {
    return body;
  }
  const start = line.index;
  return (
    body.slice(0, start) + `marp: ${value}` + body.slice(start + line[0].length)
  );
}

function stripBom(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

/** Marp's fence is `---`. A YAML `...` end is not a Marp deck. */
function closedWithFence(raw: string): boolean {
  return /---[ \t]*$/.test(raw.trimEnd());
}
