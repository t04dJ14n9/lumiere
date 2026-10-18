import type { HostCapability, Manifest } from "./manifest";
import type { NoteSettings } from "./host";

/** The features whose `needs` the host does not meet. */
export function unmetFeatures(
  manifests: readonly Manifest[],
  capabilities: ReadonlySet<HostCapability>,
): ReadonlySet<string> {
  return new Set(
    manifests
      .filter((manifest) =>
        (manifest.needs ?? []).some((need) => !capabilities.has(need)),
      )
      .map((manifest) => manifest.id),
  );
}

/** A note's settings with `off` features disabled, whatever their setting says. */
export function withFeaturesOff(
  settings: NoteSettings,
  off: ReadonlySet<string>,
): NoteSettings {
  if (off.size === 0 || !settings.features) {
    return settings;
  }
  return {
    ...settings,
    features: Object.fromEntries(
      Object.entries(settings.features).map(([id, feature]) => [
        id,
        off.has(id) ? { ...feature, enabled: false } : feature,
      ]),
    ),
  };
}

/** Whether `key` is the `enabled` switch of one of the `off` features. */
export function isOffSwitch(key: string, off: ReadonlySet<string>): boolean {
  const id = /^plugins\.([^.]+)\.enabled$/.exec(key)?.[1];
  return id !== undefined && off.has(id);
}
