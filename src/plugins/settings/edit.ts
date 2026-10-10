import type {
  ContributedSetting,
  HostViews,
  SettingsAccess,
  SettingTarget,
} from "../../shared/runtime";
import { checkNumber, editKind, relativeKey } from "./change";

export const where: Record<SettingTarget, string> = {
  workspaceFolder: "folder settings",
  workspace: "workspace settings",
  user: "user settings",
};

/** What editing a setting needs from the window. */
export interface Editing {
  settings: SettingsAccess;
  views: HostViews;
  /** The note whose folder scope applies, if one is open. */
  resource(): string | undefined;
  inform(message: string): void;
}

/** Edits one setting by its type; the value goes where the Settings UI would put it. */
export async function editSetting(
  editing: Editing,
  setting: ContributedSetting,
): Promise<void> {
  const key = relativeKey(setting.key);
  const current = editing.settings.inspect(key, editing.resource()).value;
  const write = async (value: unknown) => {
    const target = await editing.settings.update(
      key,
      value,
      editing.resource(),
    );
    editing.inform(`${key} set to ${JSON.stringify(value)} (${where[target]})`);
  };
  switch (editKind(setting.schema)) {
    case "boolean":
      return write(!(typeof current === "boolean" ? current : false));
    case "enum":
      return editChoice(editing, setting, current, write);
    case "number":
    case "integer":
      return editNumber(editing, setting, current, write);
    case "string":
      return editText(editing, key, current, write);
    default:
      // Lists and objects are edited where VS Code edits them.
      return editing.settings.openUi(`@id:${setting.key}`);
  }
}

type Write = (value: unknown) => Promise<void>;

async function editChoice(
  editing: Editing,
  setting: ContributedSetting,
  current: unknown,
  write: Write,
): Promise<void> {
  const { schema } = setting;
  const values = schema.enum ?? [];
  const picked = await editing.views.pick({
    placeholder: relativeKey(setting.key),
    items: (query) =>
      values
        .map((value, index) => ({
          label: String(value),
          description: value === current ? "current" : "",
          detail: schema.enumDescriptions?.[index] ?? "",
          value,
        }))
        .filter((item) =>
          item.label.toLowerCase().includes(query.trim().toLowerCase()),
        ),
  });
  if (picked?.item) {
    await write(picked.item.value);
  }
}

async function editNumber(
  editing: Editing,
  setting: ContributedSetting,
  current: unknown,
  write: Write,
): Promise<void> {
  const { schema } = setting;
  const range =
    schema.minimum !== undefined && schema.maximum !== undefined
      ? ` (${schema.minimum} to ${schema.maximum})`
      : "";
  const typed = await editing.views.input({
    prompt: `${relativeKey(setting.key)}${range}`,
    value: typeof current === "number" ? String(current) : "",
    validate: (text) => checkNumber(text, schema),
  });
  if (typed !== undefined) {
    await write(Number(typed.trim()));
  }
}

async function editText(
  editing: Editing,
  key: string,
  current: unknown,
  write: Write,
): Promise<void> {
  const typed = await editing.views.input({
    prompt: key,
    value: typeof current === "string" ? current : "",
    validate: () => undefined,
  });
  if (typed !== undefined) {
    await write(typed);
  }
}
