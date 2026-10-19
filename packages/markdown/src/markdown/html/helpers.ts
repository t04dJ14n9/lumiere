import MarkdownIt from "markdown-it";
// Utility instance has no feature registrations or mutable render state.
const md = new MarkdownIt();
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
export const escape = (text: string): string => md.utils.escapeHtml(text);
export function decodeMarkdownText(raw: string): string {
  return md.utils.unescapeAll(raw);
}
export function linkDestination(raw: string): string {
  const value =
    raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
  return md.normalizeLink(md.utils.unescapeAll(value));
}
export const attr = (
  name: string,
  value: string | number | undefined,
): string => (value === undefined ? "" : ` ${name}="${escape(String(value))}"`);
