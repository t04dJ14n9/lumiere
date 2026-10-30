import type * as vscode from "vscode";
import {
  MARKDOWN_EDITOR,
  type EditorProvider,
} from "../../shared/editor-provider";
import type {
  CustomEditors,
  ExplorerAttachmentReclaimHandlers,
  PanelShell,
} from "../../shared/host";
import { registerAttachmentsExplorerReclaim } from "../attachments-explorer-reclaim";
import { registerEditor } from "../editor-panels";
import type { NativeNavigation } from "../navigation";
import { registerReclaim } from "../reclaim";
import type { NativeDocuments } from "./native-documents";

/** The custom editor registry; open panels are tracked for navigation. */
export function createCustomEditors(options: {
  extension?: unknown;
  extensionUri: vscode.Uri;
  documents: NativeDocuments;
  navigation: NativeNavigation;
  panels: Map<string, PanelShell>;
  /** Workspace state: notes the reader keeps as text outlive a reload. */
  storage?: vscode.Memento;
}): CustomEditors {
  return {
    register: (provider, open) =>
      registerTrackedEditor({ ...options, provider, open }),
    registerExplorerAttachmentReclaim: (
      handlers: ExplorerAttachmentReclaimHandlers,
    ) => registerAttachmentsExplorerReclaim(handlers),
  };
}

function registerTrackedEditor(options: {
  provider: EditorProvider;
  extension?: unknown;
  extensionUri: vscode.Uri;
  documents: NativeDocuments;
  navigation: NativeNavigation;
  panels: Map<string, PanelShell>;
  storage?: vscode.Memento;
  open: (panel: PanelShell) => void;
}) {
  const { provider, panels, navigation, open, storage } = options;
  const stopEditor = registerEditor(provider, options, (panel) => {
    panels.set(panel.id, panel);
    panel.onDispose(() => panels.delete(panel.id));
    open(panel);
  });
  // The native selection bridge belongs to the editor provider's lifecycle.
  const reclaim =
    provider.viewType === MARKDOWN_EDITOR.viewType
      ? registerReclaim(navigation, storage)
      : undefined;
  reclaim?.adoptOpenTabs();
  return () => {
    reclaim?.dispose();
    stopEditor();
  };
}
