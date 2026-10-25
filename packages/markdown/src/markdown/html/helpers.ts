export interface WikiTarget {
  target: string;
  label: string;
  width?: number;
  height?: number;
}
export function wikiTarget(raw: string): WikiTarget {
  const [target = "", ...labels] = raw.replace(/\\\|/g, "|").split("|");
  const label = labels.join("|");
  const size = /^(\d+)(?:x(\d+))?$/.exec(label);
  return {
    target: target.trim(),
    label: label || target,
    ...(size
      ? {
          width: Number(size[1]),
          ...(size[2] ? { height: Number(size[2]) } : {}),
        }
      : {}),
  };
}
export function headingId(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

/** Same HTML escapes as markdown-it's `utils.escapeHtml`. */
export const escape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Same entity decode as markdown-it's `utils.unescapeAll` for common entities. */
export function decodeMarkdownText(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_all, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Resolve a Markdown link destination without pulling markdown-it into the
 * host metadata path. Angle-bracket destinations and backslash escapes match
 * CommonMark; spaces become %20 like markdown-it's normalizeLink.
 */
export function linkDestination(raw: string): string {
  const value =
    raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
  return decodeMarkdownText(value)
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1")
    .replace(/ /g, "%20");
}

export const attr = (
  name: string,
  value: string | number | undefined,
): string => (value === undefined ? "" : ` ${name}="${escape(String(value))}"`);
