import type { Plugin } from "@workshop/core";
import type { ContributedSetting } from "../../shared/runtime";
import { contributionId, validateValue } from "../../shared/setting-schema";
import { PREFIX, settingRows } from "./change";
import { FONT_SIZE_KEY, toggles, type SettingToggle } from "./commands";
import {
  askNumber,
  editSetting,
  ownSetting,
  writeSetting,
  type Editing,
} from "./edit";

/**
 * **Markdown Workshop: Open Settings**, **Change Setting…** and the commands
 * for the common settings. Each one reads and writes the same
 * `markdownWorkshop.*` key as the Settings UI, in the workspace when the
 * workspace sets it and in the user settings otherwise. They hold no state:
 * every run reads the setting as it is now, and the editors follow the
 * configuration change as they do for an edit in the Settings UI or
 * settings.json.
 *
 * A command trusts neither its arguments nor the settings files: a key must be
 * one of this extension's own contributed settings, and a value must pass that
 * setting's schema, before anything is written (`writeSetting`).
 */
export const settingsHost: Plugin = {
  name: "settings",
  inject: { required: ["workshop"] },
  apply(ctx) {
    const settings = ctx.workshop.settings;
    const views = ctx.workshop.views;
    if (!settings || !views) {
      return;
    }
    const editing: Editing = {
      settings,
      views,
      resource: () => views.activeNote(),
      inform: (message) => ctx.workshop.inform?.(message),
      error: (message) => ctx.workshop.error(message),
    };
    const command = (id: string, run: (...args: unknown[]) => unknown) =>
      ctx.effect(() => views.command(contributionId(id), run));
    command("openSettings", () => settings.openUi(settings.searchFilter));
    command("changeSetting", (argument) => changeSetting(editing, argument));
    command("setNoteFontSize", (argument) => setFontSize(editing, argument));
    for (const toggle of toggles) {
      command(toggle.command, () => flip(editing, toggle));
    }
  },
};

/** The setting for a relative key, or an error shown to the user. */
function required(
  editing: Editing,
  key: string,
): ContributedSetting | undefined {
  const setting = ownSetting(editing, `${PREFIX}${key}`);
  if (!setting) {
    editing.error(`The setting ${PREFIX}${key} is not available.`);
  }
  return setting;
}

async function flip(editing: Editing, toggle: SettingToggle): Promise<void> {
  const setting = required(editing, toggle.key);
  if (!setting) {
    return;
  }
  const current = editing.settings.inspect(toggle.key, editing.resource());
  const fallback = setting.schema.default === true;
  const next = !(typeof current.value === "boolean" ? current.value : fallback);
  await writeSetting(
    editing,
    setting,
    next,
    `${toggle.label}: ${next ? "on" : "off"}`,
  );
}

/** The list of every contributed setting; the picked one is edited by its type. */
async function changeSetting(
  editing: Editing,
  argument: unknown,
): Promise<void> {
  let chosen: ContributedSetting | undefined;
  if (argument === undefined) {
    const all = editing.settings.contributed();
    if (all.length === 0) {
      editing.error("The Markdown Workshop settings are not available.");
      return;
    }
    const picked = await editing.views.pick({
      placeholder: "Change a Markdown Workshop setting…",
      items: (query) =>
        settingRows(
          all,
          (key) => editing.settings.inspect(key, editing.resource()).value,
          query,
        ),
    });
    chosen = picked?.item?.value;
  } else {
    // A key from a keybinding or another extension: only ours is accepted.
    chosen = ownSetting(editing, argument);
    if (!chosen) {
      editing.error("That is not a Markdown Workshop setting.");
      return;
    }
  }
  if (chosen) {
    await editSetting(editing, chosen);
  }
}

async function setFontSize(editing: Editing, argument: unknown): Promise<void> {
  const setting = required(editing, FONT_SIZE_KEY);
  if (!setting) {
    return;
  }
  const current = editing.settings.inspect(FONT_SIZE_KEY, editing.resource());
  let size: unknown = argument;
  if (argument === undefined) {
    const dflt = setting.schema.default;
    const typed = await askNumber(
      editing,
      setting,
      typeof current.value === "number" ? current.value : dflt,
      `Note font size in pixels (Obsidian's default is ${String(dflt)})`,
    );
    if (typed === undefined) {
      return;
    }
    size = Number(typed.trim());
  } else if (validateValue(setting.schema, argument)) {
    editing.error("That is not a valid note font size.");
    return;
  }
  await writeSetting(editing, setting, size);
}
