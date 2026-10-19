import type * as vscode from "vscode";
import {
  MARKDOWN_EDITOR,
  type EditorProvider,
} from "../../shared/editor-provider";
import type { CustomEditors, PanelShell } from "../../shared/host";
import { registerEditor } from "../editor-panels";
import type { NativeNavigation } from "../navigation";
import { registerReclaim } from "../reclaim";
import type { NativeDocuments } from "./native-documents";

/** The custom editor registry; open panels are tracked for navigation. */
export function createCustomEditors(options: {
  extensionUri: vscode.Uri;
  documents: NativeDocuments;
  navigation: NativeNavigation;
  panels: Map<string, PanelShell>;
}): CustomEditors {
  return {
    register: (provider, open) =>
      registerTrackedEditor({ ...options, provider, open }),
  };
}

function registerTrackedEditor(options: {
  provider: EditorProvider;
  extensionUri: vscode.Uri;
  documents: NativeDocuments;
  navigation: NativeNavigation;
  panels: Map<string, PanelShell>;
  open: (panel: PanelShell) => void;
}) {
  const { provider, panels, navigation, open } = options;
  const stopEditor = registerEditor(provider, options, (panel) => {
    panels.set(panel.id, panel);
    panel.onDispose(() => panels.delete(panel.id));
    open(panel);
  });
  // The native selection bridge belongs to the editor provider's lifecycle.
  const reclaim =
    provider.viewType === MARKDOWN_EDITOR.viewType
      ? registerReclaim(navigation)
      : undefined;
  reclaim?.adoptOpenTabs();
  return () => {
    reclaim?.dispose();
    stopEditor();
  };
}
