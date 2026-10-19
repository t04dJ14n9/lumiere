import * as vscode from "vscode";
import type {
  ContributedSetting,
  SettingsAccess,
  SettingTarget,
} from "../shared/host";

import { SETTING_PREFIX, checkWrite } from "../shared/setting-schema";
import { openSettingsEditor } from "./settings-editor";

const PREFIX = SETTING_PREFIX;

/**
 * The Settings UI's own storage rule for commands that change a setting: the
 * workspace folder when it sets the key, the workspace when it does, else the
 * user's settings. Nothing is remembered between calls.
 */
/**
 * This extension's contributed settings, read from its package.json. Only
 * `lumiere.markdown.` keys with an object schema are listed; anything else
 * in a damaged or unexpected manifest is dropped.
 */
function contributed(packageJSON: unknown): readonly ContributedSetting[] {
  const configuration = (
    packageJSON as { contributes?: { configuration?: unknown } } | undefined
  )?.contributes?.configuration;
  const sections = (
    Array.isArray(configuration) ? configuration : [configuration]
  ) as ({ properties?: unknown } | undefined)[];
  const properties = Object.assign(
    {},
    ...sections.map((section) =>
      section?.properties && typeof section.properties === "object"
        ? section.properties
        : {},
    ),
  ) as Record<string, unknown>;
  return Object.entries(properties)
    .filter(
      ([key, schema]) =>
        key.startsWith(PREFIX) &&
        key.length > PREFIX.length &&
        typeof schema === "object" &&
        schema !== null,
    )
    .map(([key, schema]) => ({
      key,
      schema: schema as ContributedSetting["schema"],
    }));
}

/** The contributed setting for a relative key; anything else is refused. */
function own(
  settings: readonly ContributedSetting[],
  key: string,
): ContributedSetting {
  const setting = settings.find((item) => item.key === `${PREFIX}${key}`);
  if (!setting) {
    throw new Error(`${PREFIX}${key} is not a Lumière setting.`);
  }
  return setting;
}

export function createSettingsAccess(extension: {
  id: string;
  packageJSON: unknown;
}): SettingsAccess {
  const settings = () => contributed(extension.packageJSON);
  // SETTING_PREFIX always ends with "."; VS Code wants the section without it.
  const section = PREFIX.slice(0, -1);
  const configuration = (resource?: string) =>
    vscode.workspace.getConfiguration(
      section,
      resource ? vscode.Uri.parse(resource) : undefined,
    );
  const locate = (key: string, resource?: string) => {
    const config = configuration(resource);
    const inspected = config.inspect(key);
    let target: SettingTarget = "user";
    if (inspected?.workspaceFolderValue !== undefined) {
      target = "workspaceFolder";
    } else if (inspected?.workspaceValue !== undefined) {
      target = "workspace";
    }
    return { config, target, value: config.get(key) };
  };
  const targets: Record<SettingTarget, vscode.ConfigurationTarget> = {
    workspaceFolder: vscode.ConfigurationTarget.WorkspaceFolder,
    workspace: vscode.ConfigurationTarget.Workspace,
    user: vscode.ConfigurationTarget.Global,
  };
  return {
    // The extension also contributes PDF settings: show only these.
    searchFilter: `@ext:${extension.id} ${SETTING_PREFIX}`,
    inspect(key, resource) {
      own(settings(), key);
      const { target, value } = locate(key, resource);
      return { target, value };
    },
    async update(key, value, resource) {
      const checked = checkWrite(settings(), key, value);
      if ("problem" in checked) {
        throw new Error(
          `Not writing ${PREFIX}${String(key)}: ${checked.problem}`,
        );
      }
      const { config, target } = locate(key, resource);
      await config.update(key, value, targets[target]);
      return target;
    },
    contributed: settings,
    async openUi(query) {
      await openSettingsEditor(vscode.commands.executeCommand, query);
    },
  };
}
