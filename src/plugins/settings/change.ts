import { fuzzyMatch } from "../../shared/fuzzy";
import type { ContributedSetting, PickItem } from "../../shared/runtime";
import { SETTING_PREFIX, type Schema } from "../../shared/setting-schema";

/** The `markdownWorkbench.` prefix of every key this extension contributes. */
export const PREFIX = SETTING_PREFIX;

/** The key without the extension prefix, as `getConfiguration("markdownWorkbench")` takes it. */
export function relativeKey(key: string): string {
  return key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
}

/** `lineNumbers` to `Line numbers`. */
export function words(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Where a setting sits in the list: its plugin for `plugins.<id>.enabled` and
 * `<id>.<name>` alike, so a plugin's switch is beside its other settings.
 */
export function placement(key: string): { group: string; name: string } {
  const parts = relativeKey(key).split(".");
  if (parts[0] === "plugins" && parts.length === 3) {
    return { group: words(parts[1]!), name: words(parts[2]!) };
  }
  if (parts.length === 1) {
    return { group: "General", name: words(parts[0]!) };
  }
  return {
    group: words(parts[0]!),
    name: words(parts.slice(1).join(" ")),
  };
}

/** The description as one plain line, without Markdown code ticks and bold. */
export function plainDescription(schema: Schema): string {
  const raw = schema.markdownDescription ?? schema.description;
  const text = typeof raw === "string" ? raw : "";
  return text.replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
}

/** A value as the list shows it. */
export function formatValue(value: unknown): string {
  if (value === undefined) {
    return "unset";
  }
  const text = typeof value === "string" ? `"${value}"` : JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** The list for a query: every setting grouped by plugin, or the matches best first. */
export function settingRows(
  settings: readonly ContributedSetting[],
  current: (key: string) => unknown,
  query: string,
): PickItem<ContributedSetting>[] {
  const rows = settings.map((setting) => {
    const { group, name } = placement(setting.key);
    const value = current(relativeKey(setting.key));
    const isDefault =
      JSON.stringify(value) === JSON.stringify(setting.schema.default);
    return {
      group,
      searchable: `${group} ${name} ${relativeKey(setting.key)} ${plainDescription(setting.schema)}`,
      item: {
        label: name,
        description: `${formatValue(value)}${isDefault ? " (default)" : ""}`,
        detail: plainDescription(setting.schema) || relativeKey(setting.key),
        value: setting,
      } satisfies PickItem<ContributedSetting>,
    };
  });
  if (!query.trim()) {
    return rows
      .map((row, order) => ({ row, order }))
      .sort(
        (a, b) => a.row.group.localeCompare(b.row.group) || a.order - b.order,
      )
      .map(({ row }) => ({ ...row.item, group: row.group }));
  }
  return rows
    .flatMap((row) => {
      const match = fuzzyMatch(query, row.searchable);
      return match
        ? [
            {
              item: { ...row.item, label: `${row.group}: ${row.item.label}` },
              score: match.score,
            },
          ]
        : [];
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
