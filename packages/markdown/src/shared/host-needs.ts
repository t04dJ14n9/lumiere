/**
 * Which of Lumière's settings mean something in a given host. A plugin, or
 * one of its settings, that needs more than the host offers (Manifest
 * `needs`, `settingNeeds`) could do nothing there, so a host's settings page
 * leaves it out: in the desktop app there is no Cursor chat to send to and no
 * text editor to share a note with. When a host gains what is needed (Git,
 * say), the settings come back by themselves.
 */
import type { HostNeed, Manifest } from "./manifest";
import { contributionId } from "./setting-schema";

/** Settings outside any plugin's config (scripts/contributions.ts), and what they need. */
const WINDOW_SETTING_NEEDS: Readonly<Record<string, readonly HostNeed[]>> = {
  // Which agent chat to open: there are chats to choose only in VS Code and Cursor.
  "copyLinkForAgent.target": ["workbench"],
  // The Lumière output channel.
  "debug.logging": ["workbench"],
  // Plugins that other VS Code extensions register.
  "plugins.external": ["workbench"],
};

/** Every setting that needs something from its host, by full key, as package.json names it. */
export function settingNeeds(
  manifests: readonly Manifest[],
): ReadonlyMap<string, readonly HostNeed[]> {
  const needs = new Map<string, readonly HostNeed[]>();
  for (const manifest of manifests) {
    if (manifest.needs?.length) {
      for (const key of settingKeys(manifest)) {
        needs.set(key, manifest.needs);
      }
    }
    for (const [field, fieldNeeds] of Object.entries(
      manifest.settingNeeds ?? {},
    )) {
      needs.set(
        contributionId(
          manifest.configKeys?.[field] ?? `${manifest.id}.${field}`,
        ),
        fieldNeeds,
      );
    }
  }
  for (const [key, keyNeeds] of Object.entries(WINDOW_SETTING_NEEDS)) {
    needs.set(contributionId(key), keyNeeds);
  }
  return needs;
}

/** The settings a host that offers `offered` should not show. */
export function unavailableSettings(
  manifests: readonly Manifest[],
  offered: readonly HostNeed[],
): ReadonlySet<string> {
  const unavailable = new Set<string>();
  for (const [key, needs] of settingNeeds(manifests)) {
    if (!needs.every((need) => offered.includes(need))) {
      unavailable.add(key);
    }
  }
  return unavailable;
}

/**
 * The switches of the feature plugins a host that offers `offered` cannot
 * serve, by full key. Such a plugin stays off there: its settings are hidden
 * (`unavailableSettings`), so nothing could turn it off, and against the
 * host's stand-ins it would only cost time.
 */
export function unavailableSwitches(
  manifests: readonly Manifest[],
  offered: readonly HostNeed[],
): ReadonlySet<string> {
  return new Set(
    manifests
      .filter(
        (manifest) =>
          manifest.kind === "feature" &&
          !(manifest.needs ?? []).every((need) => offered.includes(need)),
      )
      .map((manifest) => contributionId(`plugins.${manifest.id}.enabled`)),
  );
}

/** A plugin's own setting keys: its switch and its config fields (scripts/contributions.ts). */
function settingKeys(manifest: Manifest): string[] {
  const fields = Object.keys(
    (manifest.config?.toJSONSchema().properties as
      Record<string, unknown> | undefined) ?? {},
  ).filter((field) => !manifest.nativeConfigKeys?.[field]);
  return [
    ...(manifest.kind === "feature"
      ? [contributionId(`plugins.${manifest.id}.enabled`)]
      : []),
    ...fields.map((field) =>
      contributionId(manifest.configKeys?.[field] ?? `${manifest.id}.${field}`),
    ),
  ];
}
