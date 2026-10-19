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
export type SettingKind =
  "boolean" | "tristate" | "enum" | "number" | "string" | "complex";

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

/** The prefix of every key this extension contributes. */
export const SETTING_PREFIX = "lumiere.pdf.";
const PREFIX = SETTING_PREFIX;

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
  if (property.anyOf) {
    return "complex";
  }
  if (property.enum && types.length === 1 && types[0] === "string") {
    return "enum";
  }
  if (types.length === 1) {
    if (types[0] === "boolean") {
      return "boolean";
    }
    if (types[0] === "number" || types[0] === "integer") {
      return "number";
    }
    if (types[0] === "string") {
      return "string";
    }
  }
  if (
    types.length === 2 &&
    types.includes("boolean") &&
    types.includes("null")
  ) {
    return "tristate";
  }
  return "complex";
}

/** The settings, in the order of the manifest. */
export function settingEntries(
  properties: Record<string, SchemaProperty>,
): SettingEntry[] {
  return Object.entries(properties).map(([key, property]) => {
    const rest = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
    const parts = rest.split(".");
    const kind = settingKind(property);
    return {
      key,
      group: parts.length > 1 ? words(parts[0]!) : "General",
      title: words(parts.slice(1).join(" ") || parts[0]!),
      kind,
      description: plainText(
        property.markdownDescription ?? property.description ?? "",
      ),
      choices: (kind === "enum" ? (property.enum ?? []) : []).map(
        (value, index) => ({
          value: String(value),
          description: plainText(property.enumDescriptions?.[index] ?? ""),
        }),
      ),
      minimum: property.minimum,
      maximum: property.maximum,
      defaultValue: property.default,
    };
  });
}

/** A value as a short label: `on`, `off`, `paged`, `100`, `follows the editor` for null. */
export function formatValue(value: unknown, kind: SettingKind): string {
  if (value === null || value === undefined) {
    return kind === "tristate" ? "follows the editor" : "not set";
  }
  if (typeof value === "boolean") {
    return value ? "on" : "off";
  }
  if (typeof value === "string") {
    return value === "" ? "empty" : value;
  }
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

/** What is wrong with `text` as the value of a number setting, or undefined when it is fine. */
export function numberProblem(
  text: string,
  entry: Pick<SettingEntry, "minimum" | "maximum">,
): string | undefined {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) {
    return "Enter a number";
  }
  if (entry.minimum !== undefined && value < entry.minimum) {
    return `Enter a number of at least ${entry.minimum}`;
  }
  if (entry.maximum !== undefined && value > entry.maximum) {
    return `Enter a number of at most ${entry.maximum}`;
  }
  return undefined;
}

/** Whether `value` is something the schema `property` allows; the reason when it is not. */
export function schemaProblem(
  property: SchemaProperty,
  value: unknown,
): string | undefined {
  if (property.anyOf) {
    return anyOfProblem(property.anyOf, value);
  }
  const types = ([] as string[]).concat(property.type ?? []);
  if (value === null) {
    return types.includes("null") ? undefined : "This setting cannot be null.";
  }
  if (property.enum && !property.enum.includes(value)) {
    return "Not one of the setting's values.";
  }
  const fits = types.some(
    (type) => type !== "null" && TYPE_CHECKS[type]?.(value) === true,
  );
  if (!fits) {
    return "Not a value of the setting's type.";
  }
  return typeof value === "number" ? rangeProblem(property, value) : undefined;
}

/** Allowed when any branch allows it; otherwise the first branch's reason. */
function anyOfProblem(
  anyOf: readonly unknown[],
  value: unknown,
): string | undefined {
  const problems = anyOf
    .filter(
      (branch): branch is SchemaProperty =>
        typeof branch === "object" && branch !== null,
    )
    .map((branch) => schemaProblem(branch, value));
  return problems.some((problem) => problem === undefined)
    ? undefined
    : (problems[0] ?? "Not an allowed value.");
}

const TYPE_CHECKS: Readonly<Record<string, (value: unknown) => boolean>> = {
  boolean: (value) => typeof value === "boolean",
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number" && Number.isFinite(value),
  integer: (value) => typeof value === "number" && Number.isInteger(value),
};

function rangeProblem(
  property: SchemaProperty,
  value: number,
): string | undefined {
  if (property.minimum !== undefined && value < property.minimum) {
    return `At least ${property.minimum}.`;
  }
  if (property.maximum !== undefined && value > property.maximum) {
    return `At most ${property.maximum}.`;
  }
  return undefined;
}

/**
 * The gate in front of every settings write. The schema comes from package.json
 * but is not taken on trust for what is written: the key must be one this
 * extension contributes (not another extension's, not VS Code's, not unknown),
 * and the value must fit its schema. Returns the reason to refuse, or undefined.
 */
export function writeProblem(
  properties: Record<string, SchemaProperty>,
  key: unknown,
  value: unknown,
): string | undefined {
  if (
    typeof key !== "string" ||
    !key.startsWith(SETTING_PREFIX) ||
    !Object.hasOwn(properties, key)
  ) {
    return `${String(key)} is not a setting of this extension.`;
  }
  const problem = schemaProblem(properties[key]!, value);
  return problem ? `${key}: ${problem}` : undefined;
}
