import type { ContributedSetting } from "./host";

/**
 * What a command may write to a setting, decided from the setting's own
 * contributed schema. The schema comes from package.json, but a command never
 * takes it, a key or a value on trust: every write passes `validateValue`, in
 * the command and again where the setting is written.
 */
export type Schema = ContributedSetting["schema"];

/** How a setting is edited, by its schema. */
export type EditKind =
  | "boolean"
  | "enum"
  | "number"
  | "integer"
  | "string"
  /** Arrays, objects and anything the schema does not describe: never written by a command. */
  | "external";

const primitive = (value: unknown): boolean =>
  ["string", "number", "boolean"].includes(typeof value);

/** The schema's own type, the first when it lists several (`["string", "null"]`). */
function typeOf(schema: Schema): string | undefined {
  const types = (
    Array.isArray(schema.type) ? schema.type : [schema.type]
  ) as unknown[];
  return types.find((type) => typeof type === "string" && type !== "null") as
    string | undefined;
}

export function editKind(schema: Schema | undefined): EditKind {
  if (!schema || typeof schema !== "object") {
    return "external";
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.every(primitive) ? "enum" : "external";
  }
  switch (typeOf(schema) ?? typeof schema.default) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "integer":
      return "integer";
    case "string":
      return "string";
    default:
      return "external";
  }
}

/** The numeric bounds of a schema; anything that is not a number is no bound. */
function bounds(schema: Schema): { minimum?: number; maximum?: number } {
  return {
    ...(typeof schema.minimum === "number" && { minimum: schema.minimum }),
    ...(typeof schema.maximum === "number" && { maximum: schema.maximum }),
  };
}

/** Why a number is not allowed by the schema's range and integer type, or undefined. */
export function checkNumber(value: number, schema: Schema): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Enter a number.";
  }
  if (editKind(schema) === "integer" && !Number.isInteger(value)) {
    return "Enter a whole number.";
  }
  const { minimum, maximum } = bounds(schema);
  if (minimum !== undefined && maximum !== undefined) {
    return value < minimum || value > maximum
      ? `Use a value from ${minimum} to ${maximum}.`
      : undefined;
  }
  if (minimum !== undefined && value < minimum) {
    return `Use a value of at least ${minimum}.`;
  }
  if (maximum !== undefined && value > maximum) {
    return `Use a value of at most ${maximum}.`;
  }
  return undefined;
}

/** The same check for text typed into an input box. */
export function checkNumberText(
  text: string,
  schema: Schema,
): string | undefined {
  return text.trim() === ""
    ? "Enter a number."
    : checkNumber(Number(text.trim()), schema);
}

/** Why `value` may not be written to a setting with this schema, or undefined. */
export function validateValue(
  schema: Schema | undefined,
  value: unknown,
): string | undefined {
  switch (editKind(schema)) {
    case "boolean":
      return typeof value === "boolean" ? undefined : "Expected true or false.";
    case "enum":
      return (schema!.enum as readonly unknown[]).includes(value)
        ? undefined
        : "Not one of the setting's values.";
    case "number":
    case "integer":
      return checkNumber(value as number, schema!);
    case "string":
      return typeof value === "string" ? undefined : "Expected text.";
    default:
      return "This setting is edited in the Settings UI.";
  }
}

/** The `lumiere.markdown.` prefix of every key this extension contributes. */
export const SETTING_PREFIX = "lumiere.markdown.";

/** Full contributed command / view / context id from a local suffix. */
export function contributionId(localId: string): string {
  return `${SETTING_PREFIX}${localId}`;
}

/**
 * The gate in front of every settings write: `key` (without the prefix) must
 * be one of the extension's own contributed settings and `value` must pass its
 * schema. Keys of other extensions, VS Code's own and unknown ones fail, as
 * do values the schema does not allow.
 */
export function checkWrite(
  contributed: readonly ContributedSetting[],
  key: unknown,
  value: unknown,
): { setting: ContributedSetting } | { problem: string } {
  const full = typeof key === "string" ? `${SETTING_PREFIX}${key}` : "";
  const setting = contributed.find((item) => item.key === full);
  if (!setting) {
    return { problem: `${String(key)} is not a Lumière setting.` };
  }
  const problem = validateValue(setting.schema, value);
  return problem ? { problem } : { setting };
}
