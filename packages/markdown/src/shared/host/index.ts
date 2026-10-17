/**
 * What the editor host (VS Code or Cursor) offers plugins, one service per
 * concern. Plugins inject only the services they use; unit tests provide
 * fakes of those alone. The VS Code adapter is in src/host.
 */
import type { DiffViews, GitAccess } from "../git";
import type { Endpoint } from "../rpc/endpoint";
import type { AgentHost } from "./agents";
import type { HostDocuments } from "./documents";
import type { CustomEditors } from "./editors";
import type { Navigation } from "./navigation";
import type { HostSettings } from "./settings";
import type {
  ActiveEditor,
  Clipboard,
  Dialogs,
  HostCommands,
  WorkbenchViews,
} from "./workbench";
import type { Extensions, HostWorkspace, WorkspaceStorage } from "./workspace";

export type * from "./agents";
export type * from "./documents";
export type * from "./editors";
export type * from "./navigation";
export type * from "./settings";
export type * from "./workbench";
export type * from "./workspace";
export { HOST_SERVICE_NAMES, provideHostServices } from "./provide";

/** Every host service, by the name plugins inject it under. */
export interface HostServices {
  hostDocuments: HostDocuments;
  hostCommands: HostCommands;
  clipboard: Clipboard;
  dialogs: Dialogs;
  views: WorkbenchViews;
  activeEditor: ActiveEditor;
  settings: HostSettings;
  workspace: HostWorkspace;
  storage: WorkspaceStorage;
  extensions: Extensions;
  navigation: Navigation;
  customEditors: CustomEditors;
  agentHost: AgentHost;
  git: GitAccess;
  diffViews: DiffViews;
}

declare module "@workshop/core" {
  interface Services extends HostServices {
    rpc: Endpoint;
  }
}
