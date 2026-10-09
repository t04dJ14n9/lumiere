import { features, workbenchFeatures } from "../plugins/catalog";
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
  native?: SettingsReader,
): Record<string, unknown> {
  const properties = (manifest.config?.toJSONSchema().properties ??
    {}) as Record<string, unknown>;
  return (manifest.config?.parse(
    Object.fromEntries(
      Object.keys(properties).map((key) => {
        const nativeKey = manifest.nativeConfigKeys?.[key];
        if (nativeKey) {
          return [key, native?.get(nativeKey)];
        }
        return [
          key,
          settings.get(manifest.configKeys?.[key] ?? `${manifest.id}.${key}`),
        ];
      }),
    ),
  ) ?? {}) as Record<string, unknown>;
}
export function readSettings(
  settings: SettingsReader,
  native?: SettingsReader,
): ReturnType<Workbench["config"]> {
  const options = editorConfig.parse(pluginConfiguration(settings, editor));
  return {
    debugLogging: settings.get("debug.logging", false) ?? false,
    editor: options,
    mode: options.defaultMode,
    preset: settings.get("preset", "obsidian") ?? "obsidian",
    features: Object.fromEntries(
      [...features, ...workbenchFeatures].map((manifest) => [
        manifest.id,
        {
          enabled:
            settings.get(
              `plugins.${manifest.id}.enabled`,
              manifest.defaultEnabled,
            ) ?? manifest.defaultEnabled,
          config: pluginConfiguration(settings, manifest, native),
        },
      ]),
    ),
  };
}
