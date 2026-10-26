/**
 * Lumière's settings for an embedder's settings page, on any platform: every
 * contributed setting with its value, and changes. Every write passes the
 * same check as Lumière's own settings commands (checkWrite), then goes
 * through the host's settings, so the plugins follow it as they follow any
 * change. settings-routes.ts serves it over HTTP; host-web calls it directly.
 */
import {
  checkWrite,
  SETTING_PREFIX,
  type ContributedSetting,
  type HostSettings,
} from "@workshop/markdown/portable";
import type { SettingItem } from "../settings";

export interface SettingsService {
  list(): readonly SettingItem[];
  /** A `SettingChange` (unchecked); the changed setting, or why it was refused. */
  change(
    change: Record<string, unknown>,
  ): Promise<{ readonly item: SettingItem } | { readonly problem: string }>;
}

export function createSettingsService(
  settings: HostSettings,
  titles: ReadonlyMap<string, string>,
  /** Settings that mean nothing in this host (`settingsUnavailableIn`): not listed, not written. */
  unavailable: ReadonlySet<string> = new Set(),
): SettingsService {
  const offered = () =>
    settings.access
      .contributed()
      .filter((setting) => !unavailable.has(setting.key));
  const item = (setting: ContributedSetting) =>
    settingItem(setting, settings.access.inspect(setting.key).value, titles);
  return {
    list: () => offered().map(item),
    async change(change) {
      const key = typeof change.key === "string" ? change.key : "";
      const short = key.startsWith(SETTING_PREFIX)
        ? key.slice(SETTING_PREFIX.length)
        : key;
      const value = change.reset === true ? undefined : change.value;
      const checked = checkWrite(
        offered(),
        short,
        value === undefined ? defaultOf(settings, key) : value,
      );
      if ("problem" in checked) {
        return { problem: checked.problem };
      }
      await settings.access.update(short, value);
      return { item: item(checked.setting) };
    },
  };
}

/** One setting as the page shows it. */
export function settingItem(
  setting: ContributedSetting,
  value: unknown,
  titles: ReadonlyMap<string, string>,
): SettingItem {
  const local = setting.key.slice(SETTING_PREFIX.length);
  const { category, prefix, name } = describeKey(local, titles);
  const { schema } = setting;
  return {
    key: setting.key,
    category,
    label: { prefix, name },
    description: schema.markdownDescription ?? schema.description ?? "",
    schema: {
      ...(schema.type === undefined ? {} : { type: schema.type }),
      ...(schema.enum === undefined ? {} : { enum: schema.enum }),
      ...(schema.enumDescriptions === undefined
        ? {}
        : { enumDescriptions: schema.enumDescriptions }),
      ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }),
      ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }),
      default: schema.default,
    },
    value,
    modified: JSON.stringify(value) !== JSON.stringify(schema.default),
  };
}

/**
 * The group and title of a key below `lumiere.markdown.`. A plugin's
 * settings (`plugins.vim.enabled`, `backlinks.sortOrder`) go under its
 * title; the rest under their first segment, or General.
 */
export function describeKey(
  local: string,
  titles: ReadonlyMap<string, string>,
): { category: string; prefix: string; name: string } {
  const parts = local.split(".");
  const name = words(parts.at(-1) ?? local);
  const path = parts.slice(0, -1);
  const plugin = path[0] === "plugins" && path.length > 1 ? path[1] : path[0];
  const category = plugin ? groupTitle(plugin, titles) : "General";
  return { category, prefix: category, name };
}

/**
 * A plugin's title for its id, also when the key spells the title rather than
 * the id (`copyLinkForAgent` is the agentBridge plugin's "Copy Link for Agent").
 */
function groupTitle(id: string, titles: ReadonlyMap<string, string>): string {
  const named = titles.get(id);
  if (named) {
    return named;
  }
  const spelled = words(id);
  return (
    [...titles.values()].find(
      (title) => title.toLowerCase() === spelled.toLowerCase(),
    ) ?? spelled
  );
}

/** `newNoteFolder` → `New Note Folder`. */
function words(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (first) => first.toUpperCase())
    .replace(/ ([a-z])/g, (_, letter: string) => ` ${letter.toUpperCase()}`);
}

function defaultOf(settings: HostSettings, key: string): unknown {
  return settings.access.contributed().find((item) => item.key === key)?.schema
    .default;
}
