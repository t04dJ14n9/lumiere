import type { ObsidianOverrides } from "./api";

export const OVERRIDE_KEYS = [
  "links.useWikilinks",
  "links.newLinkFormat",
  "files.attachmentFolder",
  "files.newNoteFolder",
  "vault.excludedFiles",
  "properties.display",
  "editor.defaultMode",
  "linkUpdates.mode",
] as const;

/** Only the eight phase-one policies; absent/invalid values contribute nothing. */
export function mapAppSettings(value: unknown): ObsidianOverrides {
  if (!isRecord(value)) {
    throw new Error("Obsidian app.json must contain an object.");
  }
  const entries: [string, unknown][] = [
    ["links.useWikilinks", invertBoolean(value.useMarkdownLinks)],
    [
      "links.newLinkFormat",
      member(value.newLinkFormat, ["shortest", "relative", "absolute"]),
    ],
    ["files.attachmentFolder", attachmentFolder(value.attachmentFolderPath)],
    ["files.newNoteFolder", newNoteFolder(value)],
    ["vault.excludedFiles", ignoreFilters(value.userIgnoreFilters)],
    [
      "properties.display",
      member(value.propertiesInDocument, ["visible", "hidden", "source"]),
    ],
    ["editor.defaultMode", editingMode(value.livePreview)],
    [
      "linkUpdates.mode",
      value.alwaysUpdateLinks === true ? "always" : undefined,
    ],
  ];
  return Object.freeze(
    Object.fromEntries(entries.filter(([, item]) => item !== undefined)),
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function member(
  value: unknown,
  allowed: readonly string[],
): string | undefined {
  return typeof value === "string" && allowed.includes(value)
    ? value
    : undefined;
}
function invertBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? !value : undefined;
}
function attachmentFolder(value: unknown): string | undefined {
  if (value === "/") {
    return "";
  }
  return typeof value === "string" ? value : undefined;
}
function newNoteFolder(app: Record<string, unknown>): string | undefined {
  if (app.newFileLocation === "root") {
    return "";
  }
  if (app.newFileLocation === "current") {
    return ".";
  }
  return app.newFileLocation === "folder" &&
    typeof app.newFileFolderPath === "string"
    ? app.newFileFolderPath
    : undefined;
}
function editingMode(value: unknown): string | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value ? "livePreview" : "source";
}
function ignoreFilters(value: unknown): readonly string[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    return undefined;
  }
  return Object.freeze([...value]);
}
