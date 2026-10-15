import * as vscode from "vscode";
import type {
  ContributedSetting,
  SettingsAccess,
  SettingTarget,
} from "../shared/runtime";

import { SETTING_PREFIX, checkWrite } from "../shared/setting-schema";

const EXTENSION_ID = "t04dj14n9.vscode-markdown-workbench";
const PREFIX = SETTING_PREFIX;

/**
 * The Settings UI's own storage rule for commands that change a setting: the
 * workspace folder when it sets the key, the workspace when it does, else the
 * user's settings. Nothing is remembered between calls.
 */
/**
 * This extension's contributed settings, read from its package.json. Only
 * `markdownWorkbench.` keys with an object schema are listed; anything else
 * in a damaged or unexpected manifest is dropped.
 */
function contributed(): readonly ContributedSetting[] {
  const packageJson = vscode.extensions.getExtension(EXTENSION_ID)
    ?.packageJSON as
    | {
        contributes?: {
          configuration?: { properties?: Record<string, unknown> };
        };
      }
    | undefined;
  const properties = packageJson?.contributes?.configuration?.properties;
  if (!properties || typeof properties !== "object") {
    return [];
  }
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
function own(key: string): ContributedSetting {
  const setting = contributed().find((item) => item.key === `${PREFIX}${key}`);
  if (!setting) {
    throw new Error(`${PREFIX}${key} is not a Markdown Workshop setting.`);
  }
  return setting;
}

export function createSettingsAccess(): SettingsAccess {
  const configuration = (resource?: string) =>
    vscode.workspace.getConfiguration(
      "markdownWorkbench",
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
    inspect(key, resource) {
      own(key);
      const { target, value } = locate(key, resource);
      return { target, value };
    },
    async update(key, value, resource) {
      const checked = checkWrite(contributed(), key, value);
      if ("problem" in checked) {
        throw new Error(
          `Not writing ${PREFIX}${String(key)}: ${checked.problem}`,
        );
      }
      const { config, target } = locate(key, resource);
      await config.update(key, value, targets[target]);
      return target;
    },
    contributed,
    async openUi(query) {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        query,
      );
    },
  };
}
