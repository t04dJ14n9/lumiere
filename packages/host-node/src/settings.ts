/**
 * Lumière's settings as an embedder's settings page sees them: what
 * host/settings-routes.ts serves at `/lumiere/settings`. Browser-safe:
 * packages/app's Settings tab imports it.
 */

export const SETTINGS_PATH = "/lumiere/settings";

/** The parts of a setting's JSON schema a page draws a control from. */
export interface SettingSchema {
  readonly type?: string | readonly string[];
  readonly enum?: readonly unknown[];
  readonly enumDescriptions?: readonly string[];
  /** What each enum value is called in its list; the value itself when missing. */
  readonly enumItemLabels?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: unknown;
}

export interface SettingItem {
  /** The full key, `lumiere.markdown.editor.fontSize`. */
  readonly key: string;
  /** The group it is listed under: a plugin's title, or Editor, Files… */
  readonly category: string;
  /** How VS Code's Settings editor titles it: `Editor: Font Size`. */
  readonly label: { readonly prefix: string; readonly name: string };
  /** Plain text; `code` is written in backticks. */
  readonly description: string;
  readonly schema: SettingSchema;
  readonly value: unknown;
  /** Set by the reader, rather than the default. */
  readonly modified: boolean;
}

export interface SettingsSnapshot {
  readonly items: readonly SettingItem[];
}

/** `POST /lumiere/settings`: a new value, or back to the default. */
export type SettingChange =
  | { readonly key: string; readonly value: unknown }
  | { readonly key: string; readonly reset: true };

/**
 * Whether an item matches a search, as VS Code's settings search reads it:
 * every word must appear in its key, title or description; `@modified`
 * keeps only changed settings.
 */
export function matchesSearch(item: SettingItem, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [
    item.key,
    item.category,
    item.label.prefix,
    item.label.name,
    item.description,
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) =>
    word === "@modified" ? item.modified : text.includes(word),
  );
}
