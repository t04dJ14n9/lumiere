import type { Plugin } from "../../kernel";
import type { SettingTarget } from "../../shared/runtime";
import {
  DEFAULT_FONT_SIZE,
  EXTENSION_FILTER,
  FONT_SIZE_KEY,
  checkFontSize,
  fontSizeArgument,
  toggles,
} from "./commands";

const where: Record<SettingTarget, string> = {
  workspaceFolder: "folder settings",
  workspace: "workspace settings",
  user: "user settings",
};

/**
 * **Markdown Workbench: Open Settings** and the commands for the common
 * settings. Each one reads and writes the same `markdownWorkbench.*` key as
 * the Settings UI, in the workspace when the workspace sets it and in the
 * user settings otherwise. They hold no state: every run reads the setting
 * as it is now, and the editors follow the configuration change as they do
 * for an edit in the Settings UI or settings.json.
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
    const resource = () => views.activeNote();
    const command = (id: string, run: (...args: unknown[]) => unknown) =>
      ctx.effect(() => views.command(`markdownWorkbench.${id}`, run));
    command("openSettings", () => settings.openUi(EXTENSION_FILTER));
    for (const toggle of toggles) {
      command(toggle.command, async () => {
        const current = settings.inspect(toggle.key, resource());
        const next = !(typeof current.value === "boolean"
          ? current.value
          : toggle.fallback);
        const target = await settings.update(toggle.key, next, resource());
        ctx.workbench.inform?.(
          `${toggle.label}: ${next ? "on" : "off"} (${where[target]})`,
        );
      });
    }
    command("setNoteFontSize", async (argument) => {
      const current = settings.inspect(FONT_SIZE_KEY, resource());
      let size = fontSizeArgument(argument);
      if (size === undefined) {
        const typed = await views.input({
          prompt: `Note font size in pixels (Obsidian's default is ${DEFAULT_FONT_SIZE})`,
          value: String(
            typeof current.value === "number"
              ? current.value
              : DEFAULT_FONT_SIZE,
          ),
          validate: checkFontSize,
        });
        if (typed === undefined) {
          return;
        }
        size = Number(typed.trim());
      }
      await settings.update(FONT_SIZE_KEY, size, resource());
    });
  },
};
