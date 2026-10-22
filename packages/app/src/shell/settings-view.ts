/**
 * How the Settings tab lays settings out, as pure functions: which control
 * each gets, the groups and their order, and the window's own settings that
 * sit beside Lumière's (Color Theme).
 */
import {
  matchesSearch,
  type SettingItem,
  type SettingSchema,
} from "@workshop/host-node/settings";
import type { ColorTheme } from "../shared/ui-state";

export type Control =
  "boolean" | "enum" | "number" | "integer" | "string" | "json";

/** The control for a schema, as VS Code's Settings editor picks it. */
export function controlFor(schema: SettingSchema): Control {
  if (schema.enum) {
    return "enum";
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = types.find((item) => item !== "null");
  if (
    type === "boolean" ||
    type === "number" ||
    type === "integer" ||
    type === "string"
  ) {
    return type;
  }
  return "json";
}

export interface SettingGroup {
  readonly category: string;
  readonly items: readonly SettingItem[];
}

const FIRST = ["Appearance", "Editor", "Files", "Vault"];
const LAST = ["General", "Debug"];

/** The settings that match `query`, in groups: common ones first, plugins by name. */
export function groupSettings(
  items: readonly SettingItem[],
  query: string,
): readonly SettingGroup[] {
  const groups = new Map<string, SettingItem[]>();
  for (const item of items) {
    if (matchesSearch(item, query)) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
  }
  return [...groups]
    .map(([category, members]) => ({ category, items: members }))
    .sort(
      (a, b) =>
        rank(a.category) - rank(b.category) ||
        a.category.localeCompare(b.category),
    );
}

function rank(category: string): number {
  const first = FIRST.indexOf(category);
  if (first >= 0) {
    return first - FIRST.length;
  }
  return LAST.includes(category) ? 1 + LAST.indexOf(category) : 0;
}

/** A description with `code` in backticks, as text and code runs. */
export function descriptionParts(
  text: string,
): readonly { readonly code: boolean; readonly text: string }[] {
  return text
    .split("`")
    .map((part, index) => ({ code: index % 2 === 1, text: part }))
    .filter((part) => part.text !== "");
}

/** The window's own setting, kept with its layout rather than in Lumière's settings. */
export const COLOR_THEME_KEY = "window.colorTheme";

export function colorThemeItem(theme: ColorTheme): SettingItem {
  return {
    key: COLOR_THEME_KEY,
    category: "Appearance",
    label: { prefix: "Appearance", name: "Color Theme" },
    description:
      "The window's colors: the system's light or dark appearance, or always one of them. View > Color Theme changes it too.",
    schema: {
      enum: ["system", "light", "dark"],
      enumItemLabels: ["Follow System", "Light", "Dark"],
      enumDescriptions: [
        "Follow the system's light or dark appearance.",
        "Always light.",
        "Always dark.",
      ],
      default: "system",
    },
    value: theme,
    modified: theme !== "system",
  };
}

/** How the enum value at `index` is shown in its list. */
export function enumLabel(schema: SettingSchema, index: number): string {
  const value = schema.enum?.[index];
  return (
    schema.enumItemLabels?.[index] ??
    (typeof value === "string" ? value : JSON.stringify(value))
  );
}
