import type { Context, Plugin } from "../../kernel";
import { settingRows } from "./change";
import {
  DEFAULT_FONT_SIZE,
  EXTENSION_FILTER,
  FONT_SIZE_KEY,
  checkFontSize,
  fontSizeArgument,
  toggles,
} from "./commands";
import { editSetting, where, type Editing } from "./edit";

/**
 * **Markdown Workbench: Open Settings**, **Change Setting…** and the commands
 * for the common settings. Each one reads and writes the same
 * `markdownWorkbench.*` key as the Settings UI, in the workspace when the
 * workspace sets it and in the user settings otherwise. They hold no state:
 * every run reads the setting as it is now, and the editors follow the
 * configuration change as they do for an edit in the Settings UI or
 * settings.json.
 */
export const settingsHost: Plugin = {
  name: "settings",
  inject: { required: ["workbench"] },
  apply(ctx) {
    const settings = ctx.workbench.settings;
    const views = ctx.workbench.views;
    if (!settings || !views) {
      return;
    }
    const editing: Editing = {
      settings,
      views,
      resource: () => views.activeNote(),
      inform: (message) => ctx.workbench.inform?.(message),
    };
    const command = (id: string, run: (...args: unknown[]) => unknown) =>
      ctx.effect(() => views.command(`markdownWorkbench.${id}`, run));
    command("openSettings", () => settings.openUi(EXTENSION_FILTER));
    command("changeSetting", (argument) => changeSetting(editing, argument));
    command("setNoteFontSize", (argument) => setFontSize(editing, argument));
    toggleCommands(ctx, editing, command);
  },
};

function toggleCommands(
  ctx: Context,
  editing: Editing,
  command: (id: string, run: () => unknown) => void,
): void {
  for (const toggle of toggles) {
    command(toggle.command, async () => {
      const { settings, resource } = editing;
      const current = settings.inspect(toggle.key, resource());
      const next = !(typeof current.value === "boolean"
        ? current.value
        : toggle.fallback);
      const target = await settings.update(toggle.key, next, resource());
      editing.inform(
        `${toggle.label}: ${next ? "on" : "off"} (${where[target]})`,
      );
    });
  }
}

/** The list of every contributed setting; the picked one is edited by its type. */
async function changeSetting(
  editing: Editing,
  argument: unknown,
): Promise<void> {
  const all = editing.settings.contributed();
  let chosen = all.find((setting) => setting.key === argument);
  if (!chosen) {
    const picked = await editing.views.pick({
      placeholder: "Change a Markdown Workbench setting…",
      items: (query) =>
        settingRows(
          all,
          (key) => editing.settings.inspect(key, editing.resource()).value,
          query,
        ),
    });
    chosen = picked?.item?.value;
  }
  if (chosen) {
    await editSetting(editing, chosen);
  }
}

async function setFontSize(editing: Editing, argument: unknown): Promise<void> {
  const current = editing.settings.inspect(FONT_SIZE_KEY, editing.resource());
  let size = fontSizeArgument(argument);
  if (size === undefined) {
    const typed = await editing.views.input({
      prompt: `Note font size in pixels (Obsidian's default is ${DEFAULT_FONT_SIZE})`,
      value: String(
        typeof current.value === "number" ? current.value : DEFAULT_FONT_SIZE,
      ),
      validate: checkFontSize,
    });
    if (typed === undefined) {
      return;
    }
    size = Number(typed.trim());
  }
  await editing.settings.update(FONT_SIZE_KEY, size, editing.resource());
}
