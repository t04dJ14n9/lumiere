/**
 * The VS Code adapter: every host service plugins inject (see
 * src/shared/host), built over VS Code's API.
 */
import type * as vscode from "vscode";
import type { Configuration } from "../../shared/configuration";
import type { HostServices, PanelShell } from "../../shared/host";
import { createConfiguration } from "../configuration-access";
import { createDiffViews } from "../diff-views";
import { createGitAccess } from "../git";
import { createNavigation } from "../navigation";
import type { RunningExtension } from "../running-extension";
import { createAgentHost } from "./agents";
import { createHostCommands } from "./commands";
import { createHostDocuments } from "./documents";
import { createCustomEditors } from "./editors";
import { NativeDocuments } from "./native-documents";
import { createHostSettings } from "./settings";
import {
  createActiveEditor,
  createClipboard,
  createDialogs,
  createWorkbenchViews,
} from "./workbench";
import {
  createExtensions,
  createHostWorkspace,
  createWorkspaceStorage,
} from "./workspace";

export function createHostServices(
  extension: RunningExtension,
  storage: vscode.Memento,
  configuration: Configuration = createConfiguration(),
): HostServices {
  const { extensionUri } = extension;
  const documents = new NativeDocuments();
  const panels = new Map<string, PanelShell>();
  const navigation = createNavigation(
    () => [...panels.values()],
    configuration,
  );
  return {
    hostDocuments: createHostDocuments(documents),
    hostCommands: createHostCommands(),
    clipboard: createClipboard(),
    dialogs: createDialogs(),
    views: createWorkbenchViews(extensionUri),
    activeEditor: createActiveEditor(),
    settings: createHostSettings(extension, configuration),
    workspace: createHostWorkspace(),
    storage: createWorkspaceStorage(storage),
    extensions: createExtensions(extensionUri),
    navigation,
    customEditors: createCustomEditors({
      extensionUri,
      documents,
      navigation,
      panels,
    }),
    agentHost: createAgentHost(),
    git: createGitAccess(),
    diffViews: createDiffViews(extensionUri),
  };
}
