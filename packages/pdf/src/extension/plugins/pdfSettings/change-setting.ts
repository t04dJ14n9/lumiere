import * as vscode from "vscode";
import {
  formatValue,
  numberProblem,
  settingEntries,
  type SettingEntry,
} from "../../../shared/setting-schema";
import type { PdfSettings } from "../../settings";

type Item = vscode.QuickPickItem & { entry?: SettingEntry };

/**
 * PDF: Change Setting…: every contributed setting in one list, grouped, with its
 * current value; picking one edits it by its type. Values are read and written
 * under the keys of the Settings editor (see `PdfSettings.update`).
 */
export async function changeSetting(settings: PdfSettings): Promise<void> {
  const entries = settingEntries(settings.properties());
  const config = vscode.workspace.getConfiguration();
  const items: Item[] = [];
  let group: string | undefined;
  for (const entry of entries
    .slice()
    .sort((a, b) => a.group.localeCompare(b.group))) {
    if (entry.group !== group) {
      group = entry.group;
      items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
    }
    items.push({
      label: entry.title,
      description: formatValue(config.get(entry.key), entry.kind),
      detail: entry.description,
      entry,
    });
  }
  const picked = await vscode.window.showQuickPick(items, {
    title: "PDF: Change Setting",
    placeHolder: "Choose a setting to change",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked?.entry) {
    await edit(settings, picked.entry);
  }
}

async function edit(settings: PdfSettings, entry: SettingEntry): Promise<void> {
  const current: unknown = vscode.workspace.getConfiguration().get(entry.key);
  if (entry.kind === "complex") {
    // No simple editor for it: the Settings editor shows it with its description.
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      entry.key,
    );
    return;
  }
  const answer = await askValue(entry, current);
  if (answer) {
    await settings.update(entry.key, answer.value);
  }
}

/** The new value, asked for by the setting's kind; undefined when dismissed. */
async function askValue(
  entry: SettingEntry,
  current: unknown,
): Promise<{ value: unknown } | undefined> {
  switch (entry.kind) {
    case "complex":
      return undefined;
    case "boolean":
      return { value: current !== true };
    case "tristate":
      return pickTristate(entry, current);
    case "enum":
      return pickEnum(entry, current);
    case "number":
      return askText(
        entry,
        String(current ?? entry.defaultValue ?? ""),
        Number,
      );
    case "string":
      return askText(entry, String(current ?? ""), (text) => text);
  }
}

async function pickTristate(
  entry: SettingEntry,
  current: unknown,
): Promise<{ value: boolean | null } | undefined> {
  const choices: (vscode.QuickPickItem & { value: boolean | null })[] = [
    { label: "On", value: true },
    { label: "Off", value: false },
    { label: "Follow the editor", value: null },
  ].map((choice) =>
    choice.value === (current ?? null)
      ? { ...choice, description: "current" }
      : choice,
  );
  const choice = await vscode.window.showQuickPick(choices, {
    title: entry.title,
    placeHolder: entry.description,
  });
  return choice && { value: choice.value };
}

async function pickEnum(
  entry: SettingEntry,
  current: unknown,
): Promise<{ value: string } | undefined> {
  const choices: vscode.QuickPickItem[] = entry.choices.map((choice) => ({
    label: choice.value,
    ...(choice.description ? { detail: choice.description } : {}),
    ...(choice.value === current ? { description: "current" } : {}),
  }));
  const choice = await vscode.window.showQuickPick(choices, {
    title: entry.title,
    placeHolder: entry.description,
  });
  return choice && { value: choice.label };
}

async function askText(
  entry: SettingEntry,
  value: string,
  parse: (text: string) => unknown,
): Promise<{ value: unknown } | undefined> {
  const text = await vscode.window.showInputBox({
    title: entry.title,
    prompt: entry.description,
    value,
    ...(entry.kind === "number"
      ? { validateInput: (input: string) => numberProblem(input, entry) }
      : {}),
  });
  return text === undefined ? undefined : { value: parse(text) };
}
