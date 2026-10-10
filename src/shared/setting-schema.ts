/**
 * The extension's contributed settings (package.json `contributes.configuration`)
 * as the data a "change a setting" picker needs. Everything is derived from the
 * manifest, so a new setting shows up there without code, and the picker never
 * drifts from the Settings editor.
 */

/** One entry of `contributes.configuration.properties`, the parts used here. */
export interface SchemaProperty {
  type?: string | string[];
  enum?: unknown[];
  enumDescriptions?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  description?: string;
  markdownDescription?: string;
  anyOf?: unknown[];
}

/**
 * How a setting is edited:
 *   boolean   on / off
 *   tristate  on / off / null (follow another setting)
 *   enum      one of a list
 *   number    a number within `minimum`..`maximum`
 *   string    free text
 *   complex   anything else: edited in the Settings editor or settings.json
 */
export type SettingKind = "boolean" | "tristate" | "enum" | "number" | "string" | "complex";

export interface SettingEntry {
  key: string;
  /** "View", "Toolbar", …: the part of the key after the extension's prefix. */
  group: string;
  /** "Smooth Scrolling": the last part of the key, as words. */
  title: string;
  kind: SettingKind;
  description: string;
  choices: { value: string; description: string }[];
  minimum: number | undefined;
  maximum: number | undefined;
  defaultValue: unknown;
}

const PREFIX = "vscodeEmbedPdf.";

const words = (text: string): string =>
  text
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/^./u, (first) => first.toUpperCase());

/** Markdown reduced to plain text: code marks, links, bold and `#setting#` references. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/#([\w.]+)#/gu, "$1")
    .replace(/[`*_]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function settingKind(property: SchemaProperty): SettingKind {
  const types = ([] as string[]).concat(property.type ?? []);
  if (property.anyOf) return "complex";
  if (property.enum && types.length === 1 && types[0] === "string") return "enum";
  if (types.length === 1) {
    if (types[0] === "boolean") return "boolean";
    if (types[0] === "number" || types[0] === "integer") return "number";
    if (types[0] === "string") return "string";
  }
  if (types.length === 2 && types.includes("boolean") && types.includes("null")) return "tristate";
  return "complex";
}

/** The settings, in the order of the manifest. */
export function settingEntries(properties: Record<string, SchemaProperty>): SettingEntry[] {
  return Object.entries(properties).map(([key, property]) => {
    const rest = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
    const parts = rest.split(".");
    const kind = settingKind(property);
    return {
      key,
      group: parts.length > 1 ? words(parts[0]!) : "General",
      title: words(parts.slice(1).join(" ") || parts[0]!),
      kind,
      description: plainText(property.markdownDescription ?? property.description ?? ""),
      choices: (kind === "enum" ? (property.enum ?? []) : []).map((value, index) => ({
        value: String(value),
        description: plainText(property.enumDescriptions?.[index] ?? ""),
      })),
      minimum: property.minimum,
      maximum: property.maximum,
      defaultValue: property.default,
    };
  });
}

/** A value as a short label: `on`, `off`, `paged`, `100`, `follows the editor` for null. */
export function formatValue(value: unknown, kind: SettingKind): string {
  if (value === null || value === undefined) return kind === "tristate" ? "follows the editor" : "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string") return value === "" ? "empty" : value;
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

/** What is wrong with `text` as the value of a number setting, or undefined when it is fine. */
export function numberProblem(text: string, entry: Pick<SettingEntry, "minimum" | "maximum">): string | undefined {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) return "Enter a number";
  if (entry.minimum !== undefined && value < entry.minimum) return `Enter a number of at least ${entry.minimum}`;
  if (entry.maximum !== undefined && value > entry.maximum) return `Enter a number of at most ${entry.maximum}`;
  return undefined;
}
