import { readFileSync } from "node:fs";
import path from "node:path";

/** What tests read from the extension manifest. */
export interface ExtensionManifest {
  activationEvents?: string[];
  contributes: {
    commands: { command: string; title: string; category?: string }[];
    configuration: { title: string; properties: Record<string, unknown> }[];
    keybindings: {
      command: string;
      key?: string;
      mac?: string;
      when?: string;
    }[];
    menus: Record<string, { command: string; when?: string; group?: string }[]>;
    views?: Record<string, { id: string; name: string; when?: string }[]>;
    customEditors: { viewType: string }[];
  };
}

/** The extension's package.json at the repository root: what ships. */
export function extensionManifest(): ExtensionManifest {
  const file = path.resolve(__dirname, "../../../../package.json");
  return JSON.parse(readFileSync(file, "utf8")) as ExtensionManifest;
}

/** Every contributed setting, across the manifest's settings sections. */
export function contributedProperties<T = unknown>(): Record<string, T> {
  return Object.assign(
    {},
    ...extensionManifest().contributes.configuration.map(
      (section) => section.properties,
    ),
  ) as Record<string, T>;
}
