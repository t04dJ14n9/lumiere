/** Where a setting is written: the workspace's settings.json, or the user's. */
export type SettingTarget = "workspace" | "user";

/**
 * Where a command saves a setting so the Settings editor shows it: in the
 * workspace when the workspace already sets it (a user-level write would be
 * hidden behind that value), otherwise in the user settings.
 */
export function settingTarget(
  inspected:
    | {
        workspaceValue?: unknown;
        workspaceFolderValue?: unknown;
      }
    | undefined,
): SettingTarget {
  return inspected?.workspaceValue !== undefined ||
    inspected?.workspaceFolderValue !== undefined
    ? "workspace"
    : "user";
}
