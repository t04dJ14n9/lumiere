/**
 * Settings whose default differs in Lumière's own app from VS Code's.
 *
 * Git runs with the repository's own configuration, and that configuration
 * can name programs for git to run (textconv and clean filters, fsmonitor),
 * even for a blame. VS Code keeps its git extension off in folders the owner
 * has not trusted; here the Git features start off, and the owner turns them
 * on in Settings for their own repositories.
 */
import type { ContributedSetting } from "@workshop/host-node";

export const APP_DEFAULTS: Readonly<Record<string, unknown>> = {
  "lumiere.markdown.plugins.gitBlame.enabled": false,
  "lumiere.markdown.plugins.gitGutter.enabled": false,
  "lumiere.markdown.plugins.gitInline.enabled": false,
};

/** The contributed settings, with the app's own defaults. */
export function withAppDefaults(
  contributed: readonly ContributedSetting[],
  defaults: Readonly<Record<string, unknown>> = APP_DEFAULTS,
): ContributedSetting[] {
  return contributed.map((setting) =>
    setting.key in defaults
      ? {
          ...setting,
          schema: { ...setting.schema, default: defaults[setting.key] },
        }
      : setting,
  );
}
