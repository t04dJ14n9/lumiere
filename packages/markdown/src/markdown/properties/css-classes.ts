import { frontmatter } from "./frontmatter";

const VALID_CLASS_TOKEN = /^[A-Za-z0-9_-]+$/;
const RESERVED_EDITOR_CLASSES = new Set([
  "cm-editor",
  "cm-content",
  "cm-scroller",
  "mw-editor",
  "is-source-mode",
  "markdown-rendered",
]);

function extractTokens(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(
        (token) =>
          VALID_CLASS_TOKEN.test(token) && !RESERVED_EDITOR_CLASSES.has(token),
      );
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => extractTokens(entry));
  }
  return [];
}

/**
 * Extract sanitized CSS class names from `cssclasses` (and legacy `cssclass`)
 * in parsed YAML frontmatter values, matching Obsidian's `JT(frontmatter)`.
 */
export function frontmatterCssClasses(
  values: Record<string, unknown> | undefined,
): string[] {
  if (!values) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    const normalized = key.toLowerCase();
    if (normalized !== "cssclasses" && normalized !== "cssclass") {
      continue;
    }
    for (const token of extractTokens(value)) {
      if (!seen.has(token)) {
        seen.add(token);
        result.push(token);
      }
    }
  }
  return result;
}

export function noteCssClasses(source: string): string[] {
  return frontmatterCssClasses(frontmatter(source)?.values);
}
