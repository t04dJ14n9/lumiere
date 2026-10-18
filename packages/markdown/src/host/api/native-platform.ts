import * as vscode from "vscode";
import type { RealPaths } from "@workshop/platform";
import type { ApiPlatform } from "./platform";
import type { ConfigurationScope } from "./types";
import { RpcError } from "../../shared/rpc/lifecycle";
import { MARKDOWN_EDITOR } from "../../shared/editor-provider";
import { contained } from "../navigation";
import { warmMarkdownDocument } from "../document-warm";
import { openSettingsEditor } from "../settings-editor";
export function nativePlatform(
  extensionId: string,
  realPaths: RealPaths | undefined,
): ApiPlatform {
  return {
    uri: (value) => vscode.Uri.parse(value, true),
    joinPath: (base, path) => vscode.Uri.joinPath(base, path),
    assertContained: (root, target) => contained(root, target, realPaths),
    async open(uri, options) {
      await warmMarkdownDocument(uri);
      await vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        MARKDOWN_EDITOR.viewType,
        {
          viewColumn: options.viewColumn,
          preserveFocus: options.preserveFocus,
        },
      );
    },
    installed: (id) => !!vscode.extensions.getExtension(id),
    external: (resource) =>
      vscode.workspace
        .getConfiguration("markdownWorkshop", resource)
        .get("plugins.external", {}),
    write: writeSetting,
    async settings(resource, query) {
      await openSettingsEditor(vscode.commands.executeCommand, {
        query: query ?? `@ext:${extensionId} plugins`,
        ...(resource ? { resource } : {}),
      });
    },
  };
}
async function writeSetting(
  id: string,
  enabled: boolean | undefined,
  scope: ConfigurationScope,
  external: boolean,
): Promise<void> {
  const target = configurationTarget(scope);
  const configuration = vscode.workspace.getConfiguration(
    "markdownWorkshop",
    scope.resource,
  );
  if (!external) {
    await configuration.update(`plugins.${id}.enabled`, enabled, target);
    return;
  }
  const inspected =
    configuration.inspect<Record<string, boolean>>("plugins.external");
  const fields = {
    global: "globalValue",
    workspace: "workspaceValue",
    workspaceFolder: "workspaceFolderValue",
  } as const;
  // Copy only this scope's value: inherited overrides must not be pinned by a write.
  const value = { ...inspected?.[fields[scope.target]] };
  if (enabled === undefined) {
    delete value[id];
  } else {
    value[id] = enabled;
  }
  await configuration.update(
    "plugins.external",
    Object.keys(value).length ? value : undefined,
    target,
  );
}
function configurationTarget(
  scope: ConfigurationScope,
): vscode.ConfigurationTarget {
  if (scope.target === "workspaceFolder") {
    if (
      !scope.resource ||
      !vscode.workspace.getWorkspaceFolder(scope.resource)
    ) {
      throw new RpcError(
        "InvalidArgument",
        "Workspace-folder scope requires a resource inside a workspace folder",
      );
    }
    return vscode.ConfigurationTarget.WorkspaceFolder;
  }
  if (scope.target === "workspace") {
    if (!vscode.workspace.workspaceFolders?.length) {
      throw new RpcError("InvalidArgument", "No workspace is open");
    }
    return vscode.ConfigurationTarget.Workspace;
  }
  if (scope.target !== "global") {
    throw new RpcError("InvalidArgument", "Unknown configuration scope");
  }
  return vscode.ConfigurationTarget.Global;
}
