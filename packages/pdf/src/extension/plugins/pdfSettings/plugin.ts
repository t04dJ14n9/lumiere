import * as vscode from "vscode";
import { PAGE_LAYOUTS, SCROLL_MODES } from "../../../shared/view-options";
import {
  parseDefaultZoom,
  resolveSmoothScrolling,
} from "../../../shared/view-settings";
import type { Plugin } from "@workshop/core";
import type { PdfSettings } from "../../settings";
import type {} from "../services";
import { changeSetting } from "./change-setting";
import { openSettingsEditor } from "../../settings-editor";
import manifest from "./manifest";
import { SETTINGS_COMMAND_IDS } from "../pdf/registered-commands";

const VIEW = "pdfWorkshop.view";

const read = <T>(key: string, fallback: T): T =>
  vscode.workspace.getConfiguration().get<T>(key, fallback);
const say = (text: string): void =>
  void vscode.window.setStatusBarMessage(`PDF: ${text}`, 3_000);

type Pick<T> = vscode.QuickPickItem & { value: T };

/** Ask for one of `choices`, marking the current one; undefined when dismissed. */
async function choose<T>(
  title: string,
  choices: Pick<T>[],
  current: unknown,
): Promise<T | undefined> {
  const items = choices.map((choice) =>
    choice.value === current ? { ...choice, description: "current" } : choice,
  );
  return (await vscode.window.showQuickPick(items, { title }))?.value;
}

/**
 * Easy access to the settings: PDF: Open Settings, and commands for the
 * common ones. Every command reads and writes the very key the Settings
 * editor shows (see `PdfSettings.update`) and keeps nothing of its own, so the two
 * agree at all times; the viewers follow through the configuration events.
 */
export const pdfSettingsPlugin: Plugin = {
  name: manifest.id,
  inject: { required: ["pdfSettings"] },
  apply(ctx) {
    const settings = ctx.pdfSettings;
    const commands: Record<
      keyof typeof SETTINGS_COMMAND_IDS,
      () => Thenable<unknown> | void
    > = {
      openSettings: () =>
        openSettingsEditor(
          vscode.commands.executeCommand,
          settings.searchFilter,
        ),
      changeSetting: () => changeSetting(settings),
      toggleSmoothScrolling: () => toggleSmoothScrolling(settings),
      toggleKeyboardShortcuts: () => toggleKeyboardShortcuts(settings),
      setDefaultZoom: () => setDefaultZoom(settings),
      setDefaultPageLayout: () =>
        setDefault(settings, "pageLayout", "Default Page Layout", PAGE_LAYOUTS),
      setDefaultScrollMode: () =>
        setDefault(settings, "scrollMode", "Default Scrolling", SCROLL_MODES),
    };
    for (const [id, run] of Object.entries(commands)) {
      ctx.own(
        vscode.commands.registerCommand(
          SETTINGS_COMMAND_IDS[id as keyof typeof SETTINGS_COMMAND_IDS],
          run,
        ),
        "command",
      );
    }
  },
};

async function toggleSmoothScrolling(settings: PdfSettings): Promise<void> {
  const on = resolveSmoothScrolling(
    read(`${VIEW}.smoothScrolling`, null),
    read("editor.smoothScrolling", false),
    false,
  );
  await settings.update(`${VIEW}.smoothScrolling`, !on);
  say(`smooth scrolling ${on ? "off" : "on"}`);
}

async function toggleKeyboardShortcuts(settings: PdfSettings): Promise<void> {
  const on = read("pdfWorkshop.keyboardShortcuts", true);
  await settings.update("pdfWorkshop.keyboardShortcuts", !on);
  say(`keyboard shortcuts ${on ? "off" : "on"}`);
}

async function setDefaultZoom(settings: PdfSettings): Promise<void> {
  const current = parseDefaultZoom(read(`${VIEW}.defaultZoom`, "fitWidth"));
  const custom = typeof current === "number";
  const choice = await choose<string>(
    "Default Zoom",
    [
      { label: "Fit width", value: "fitWidth" },
      { label: "Fit page", value: "fitPage" },
      { label: "Actual size (100%)", value: "actual" },
      {
        label: custom
          ? `Custom percentage… (${current}%)`
          : "Custom percentage…",
        value: "custom",
      },
    ],
    custom ? "custom" : current,
  );
  if (!choice) {
    return;
  }
  if (choice !== "custom") {
    return settings.update(`${VIEW}.defaultZoom`, choice);
  }
  const text = await vscode.window.showInputBox({
    title: "Default Zoom",
    prompt: "A percentage from 25 to 400",
    value: custom ? String(current) : "100",
    validateInput: (value) =>
      Number.isFinite(Number(value)) &&
      Number(value) >= 25 &&
      Number(value) <= 400
        ? undefined
        : "Enter a number from 25 to 400",
  });
  if (text !== undefined) {
    await settings.update(`${VIEW}.defaultZoom`, Number(text));
  }
}

/** Pick the default page layout or scrolling from the viewer's own options. */
async function setDefault(
  settings: PdfSettings,
  key: "pageLayout" | "scrollMode",
  title: string,
  options: readonly { label: string; value: string }[],
): Promise<void> {
  const choice = await choose(
    title,
    options.map((item) => ({ label: item.label, value: item.value })),
    read(`${VIEW}.${key}`, key === "pageLayout" ? "single" : "continuous"),
  );
  if (choice) {
    await settings.update(`${VIEW}.${key}`, choice);
  }
}
