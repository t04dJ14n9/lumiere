const MAX_AGENT_CLIPBOARD_PATH_CHARACTERS = 32 * 1024;
export function formatMarkdownAgentReference(
  relativePath: string,
  startLine: number,
  endLine: number,
): string {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath);
  if (!normalizedPath) {
    throw new TypeError("Markdown agent reference path must be workspace-relative.");
  }
  if (!isPositiveSafeInteger(startLine) || !isPositiveSafeInteger(endLine)) {
    throw new TypeError("Markdown agent reference lines must be positive safe integers.");
  }
  if (endLine < startLine) {
    throw new RangeError("Markdown agent reference lines must be ordered.");
  }

  const lineRange = startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
  return `@${normalizedPath}#${lineRange}`;
}

function normalizeWorkspaceRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.trim() !== normalized ||
    normalized.length > MAX_AGENT_CLIPBOARD_PATH_CHARACTERS ||
    hasControlCharacters(normalized) ||
    normalized.startsWith("/") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized) ||
    /^[A-Za-z]:($|\/)/.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  )
    return undefined;
  return normalized;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || codePoint === 0x7f;
  });
}
