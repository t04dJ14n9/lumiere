import { features } from "../plugins/catalog";
import editor, { config as editorConfig } from "../plugins/editor/manifest";
import type { Manifest } from "../shared/manifest";
import type { Workbench } from "../shared/runtime";
export interface SettingsReader {
  get<T>(key: string, fallback?: T): T | undefined;
}
/** Read all resource-scoped fields through their owning manifest's schema. */
export function pluginConfiguration(
  settings: SettingsReader,
  manifest: Manifest,
): Record<string, unknown> {
  const properties = (manifest.config?.toJSONSchema().properties ??
    {}) as Record<string, unknown>;
  return (manifest.config?.parse(
    Object.fromEntries(
      Object.keys(properties).map((key) => [
        key,
        settings.get(manifest.configKeys?.[key] ?? `${manifest.id}.${key}`),
      ]),
    ),
  ) ?? {}) as Record<string, unknown>;
}
export function readSettings(
  settings: SettingsReader,
): ReturnType<Workbench["config"]> {
  const options = editorConfig.parse(pluginConfiguration(settings, editor));
  return {
    editor: options,
    mode: options.defaultMode,
    preset: settings.get("preset", "obsidian") ?? "obsidian",
    features: Object.fromEntries(
      features.map((manifest) => [
        manifest.id,
        {
          enabled:
            settings.get(
              `plugins.${manifest.id}.enabled`,
              manifest.defaultEnabled,
            ) ?? manifest.defaultEnabled,
          config: pluginConfiguration(settings, manifest),
        },
      ]),
    ),
  };
}
