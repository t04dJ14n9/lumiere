/**
 * Lumière's settings in DSH. VS Code reads them from its settings files with
 * the extension's contributed defaults; here the defaults come from the same
 * contributions, copied into the bundle, and a reader's changes are kept in
 * one JSON file. There are no folder or language scopes.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { Disposer } from "@workshop/core";
import {
  EffectiveConfiguration,
  readSettings,
  type ContributedSetting,
  type HostSettings,
  type SettingsAccess,
} from "@workshop/markdown/portable";

const PREFIX = "lumiere.markdown.";

export interface DshSettingsOptions {
  /** The extension's contributed settings (`contributes.configuration`). */
  readonly contributed: readonly ContributedSetting[];
  /** Where the reader's changes are kept. */
  readonly file: string;
}

export function createDshSettings(options: DshSettingsOptions): HostSettings {
  const values = new SettingValues(options);
  const effective = new EffectiveConfiguration({
    get: (key) => values.get(PREFIX + key),
    inspect: (key) => values.inspect(PREFIX + key),
    onDidChange: (listener) => values.onChange(listener),
  });
  return {
    get: (key, fallback, resource) => effective.get(key, fallback, resource),
    forNote: (document) =>
      readSettings({
        get: (key, fallback) => effective.get(key, fallback, document.uri),
      }),
    onChange: (listener) => effective.onDidChange(listener),
    effective,
    access: values.access(),
    // DSH has no editor associations: Lumière's preview claims notes itself.
    editorAssociations: { read: () => undefined, write: async () => {} },
  };
}

class SettingValues {
  private readonly defaults: Map<string, unknown>;
  private overrides: Record<string, unknown>;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: DshSettingsOptions) {
    this.defaults = new Map(
      options.contributed.map((setting) => [
        setting.key,
        setting.schema.default,
      ]),
    );
    this.overrides = readOverrides(options.file);
  }

  get(key: string): unknown {
    return key in this.overrides ? this.overrides[key] : this.defaults.get(key);
  }

  inspect(key: string): Record<string, unknown> | undefined {
    if (!this.defaults.has(key) && !(key in this.overrides)) {
      return undefined;
    }
    return {
      key,
      defaultValue: this.defaults.get(key),
      ...(key in this.overrides ? { globalValue: this.overrides[key] } : {}),
    };
  }

  onChange(listener: () => void): Disposer {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  access(): SettingsAccess {
    return {
      inspect: (key) => ({ value: this.get(fullKey(key)), target: "user" }),
      update: async (key, value) => {
        await this.write(fullKey(key), value);
        return "user";
      },
      contributed: () => this.options.contributed,
      searchFilter: "lumiere",
      openUi: async () => {},
    };
  }

  private async write(key: string, value: unknown): Promise<void> {
    const next = { ...this.overrides };
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    await mkdir(path.dirname(this.options.file), { recursive: true });
    await writeFile(this.options.file, JSON.stringify(next, null, 2) + "\n");
    this.overrides = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function fullKey(key: string): string {
  return key.startsWith(PREFIX) ? key : PREFIX + key;
}

/** A missing or unreadable file means no changes; a damaged one is not fatal. */
function readOverrides(file: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
