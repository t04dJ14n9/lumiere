/** Lumière's settings from the window: host-node's `/lumiere/settings`. */
import {
  SETTINGS_PATH,
  type SettingChange,
  type SettingItem,
  type SettingsSnapshot,
} from "@workshop/host-node/settings";

export const settings = {
  async list(): Promise<readonly SettingItem[]> {
    const response = await fetch(SETTINGS_PATH);
    if (!response.ok) {
      throw new Error(`Could not read the settings (${response.status})`);
    }
    return ((await response.json()) as SettingsSnapshot).items;
  },
  /** The changed setting, or an error that says why the value was refused. */
  async change(change: SettingChange): Promise<SettingItem> {
    const response = await fetch(SETTINGS_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(change),
    });
    const body = (await response.json()) as SettingItem & { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? `Could not change ${change.key}`);
    }
    return body;
  },
};
