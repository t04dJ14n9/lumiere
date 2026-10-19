import * as vscode from "vscode";
import type { Configuration } from "../../shared/configuration";
import type {
  EditorAssociations,
  HostSettings,
  NoteSettings,
} from "../../shared/host";
import { readSettings, type SettingsReader } from "../settings";
import { createSettingsAccess } from "../settings-access";
import type { RunningExtension } from "../running-extension";

export function createHostSettings(
  extension: RunningExtension,
  configuration: Configuration,
): HostSettings {
  return {
    get: (key, fallback, resource) =>
      configuration.get(key, fallback, resource),
    forNote: (document) => noteSettings(configuration, document.uri),
    onChange: (listener) => configuration.onDidChange(listener),
    effective: configuration,
    access: createSettingsAccess(extension),
    editorAssociations: workspaceEditorAssociations(),
  };
}

/** Our settings for a note, and the native editor settings as they apply to Markdown. */
function noteSettings(configuration: Configuration, uri: string): NoteSettings {
  const config: SettingsReader = {
    get: (key, fallback) => configuration.get(key, fallback, uri),
  };
  const editor = vscode.workspace.getConfiguration(undefined, {
    uri: vscode.Uri.parse(uri),
    languageId: "markdown",
  });
  const native: SettingsReader = {
    get: <T>(key: string, fallback?: T) => {
      if (key.endsWith("#default")) {
        return editor.inspect(key.slice(0, -8))?.defaultValue as T | undefined;
      }
      if (key.endsWith("#explicit")) {
        return isExplicit(editor.inspect(key.slice(0, -9))) as T;
      }
      return editor.get<T>(key, fallback as T);
    },
  };
  return readSettings(config, native);
}

/** Whether any scope (language-specific ones included) sets the key. */
function isExplicit(
  values: ReturnType<vscode.WorkspaceConfiguration["inspect"]>,
): boolean {
  return Boolean(
    values &&
    [
      values.globalValue,
      values.workspaceValue,
      values.workspaceFolderValue,
      values.globalLanguageValue,
      values.workspaceLanguageValue,
      values.workspaceFolderLanguageValue,
    ].some((value) => value !== undefined),
  );
}

function workspaceEditorAssociations(): EditorAssociations {
  const settings = () => vscode.workspace.getConfiguration("workbench");
  return {
    read() {
      if (!vscode.workspace.workspaceFolders?.length) {
        return undefined;
      }
      return settings().inspect("editorAssociations")?.workspaceValue ?? {};
    },
    async write(associations) {
      await settings().update(
        "editorAssociations",
        associations,
        vscode.ConfigurationTarget.Workspace,
      );
    },
  };
}
