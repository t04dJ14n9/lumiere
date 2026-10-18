/**
 * The VS Code adapter: every host service plugins inject (see
 * src/shared/host), built over VS Code's API.
 */
import type * as vscode from "vscode";
import type { HostPlatform } from "@workshop/platform";
import type { Configuration } from "../../shared/configuration";
import type { GitAccess } from "../../shared/git";
import type { HostServices, PanelShell } from "../../shared/host";
import { createConfiguration } from "../configuration-access";
import { createDiffViews } from "../diff-views";
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

export interface HostServiceOptions {
  extension: RunningExtension;
  storage: vscode.Memento;
  platform: HostPlatform;
  /** Git, on the desktop (`@workshop/markdown/desktop`). */
  git: GitAccess;
  configuration?: Configuration;
}

export function createHostServices({
  extension,
  storage,
  platform,
  git,
  configuration = createConfiguration(),
}: HostServiceOptions): HostServices {
  const { extensionUri } = extension;
  const documents = new NativeDocuments();
  const panels = new Map<string, PanelShell>();
  const navigation = createNavigation(
    () => [...panels.values()],
    platform,
    configuration,
  );
  return {
    hostDocuments: createHostDocuments(documents, platform.digests),
    hostCommands: createHostCommands(),
    clipboard: createClipboard(),
    dialogs: createDialogs(),
    views: createWorkbenchViews(extensionUri),
    activeEditor: createActiveEditor(),
    settings: createHostSettings(extension, configuration),
    workspace: createHostWorkspace(platform.realPaths),
    storage: createWorkspaceStorage(storage),
    extensions: createExtensions(platform.workers),
    navigation,
    customEditors: createCustomEditors({
      extensionUri,
      documents,
      navigation,
      panels,
    }),
    agentHost: createAgentHost(platform.agentFiles),
    git,
    diffViews: createDiffViews(extensionUri),
  };
}
