import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { EditorProvider } from "../shared/editor-provider";
import type { PanelShell } from "../shared/runtime";
import { panelIsActive } from "./active-panel";
import type { NativeDocuments } from "./workbench";

/**
 * The VS Code side of an editor panel: registration, the webview, its
 * transport and its active state, for any `EditorProvider`. Invariant:
 * nothing here depends on the document's language; what the panel shows is
 * the editor plugin's business.
 */
interface EditorHost {
  extensionUri: vscode.Uri;
  documents: NativeDocuments;
}

function panelTransport(panel: vscode.WebviewPanel): PanelShell["transport"] {
  return {
    send(message) {
      void panel.webview.postMessage(message);
    },
    listen(receive) {
      const stop = panel.webview.onDidReceiveMessage(receive);
      return () => stop.dispose();
    },
  };
}
function isActivePanel(
  viewType: string,
  document: vscode.TextDocument,
  panel: vscode.WebviewPanel,
): boolean {
  const group = vscode.window.tabGroups.activeTabGroup;
  const input = group.activeTab?.input;
  const custom = input instanceof vscode.TabInputCustom ? input : undefined;
  return panelIsActive(
    panel,
    {
      groupColumn: group.viewColumn,
      viewType: custom?.viewType,
      uri: custom?.uri.toString(),
    },
    { viewType, uri: document.uri.toString() },
  );
}
function panelState(
  panel: vscode.WebviewPanel,
  listener: () => void,
): ReturnType<PanelShell["onState"]> {
  const panelSubscription = panel.onDidChangeViewState(listener);
  const groupSubscription =
    vscode.window.tabGroups.onDidChangeTabGroups(listener);
  // Closing a tab opened over the panel (Ctrl+N, then close) changes tabs,
  // not groups; without this the plugin context keys stayed false.
  const tabSubscription = vscode.window.tabGroups.onDidChangeTabs(listener);
  return () => {
    panelSubscription.dispose();
    groupSubscription.dispose();
    tabSubscription.dispose();
  };
}
function createPanelShell(
  provider: EditorProvider,
  document: vscode.TextDocument,
  panel: vscode.WebviewPanel,
  { extensionUri, documents }: EditorHost,
): PanelShell {
  const id = randomUUID();
  const root =
    vscode.workspace.getWorkspaceFolder(document.uri)?.uri ??
    vscode.Uri.joinPath(document.uri, "..");
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist"), root],
  };

  return {
    id,
    get column() {
      return panel.viewColumn;
    },
    document: documents.wrap(document),
    cspSource: panel.webview.cspSource,
    trusted: vscode.workspace.isTrusted,
    transport: panelTransport(panel),
    active: () => isActivePanel(provider.viewType, document, panel),
    reveal() {
      panel.reveal();
    },
    dispose() {
      panel.dispose();
    },
    setHTML(html) {
      panel.webview.html = html;
    },
    resource(uri) {
      return panel.webview.asWebviewUri(vscode.Uri.parse(uri)).toString();
    },
    asset(relative) {
      return panel.webview
        .asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", relative))
        .toString();
    },
    onDispose(listener) {
      const stop = panel.onDidDispose(listener);
      return () => stop.dispose();
    },
    onState: (listener) => panelState(panel, listener),
  };
}
/** Register `provider` as a custom editor; each panel it opens goes to `open`. */
export function registerEditor(
  provider: EditorProvider,
  host: EditorHost,
  open: (panel: PanelShell) => void,
) {
  const registration = vscode.window.registerCustomEditorProvider(
    provider.viewType,
    {
      resolveCustomTextEditor(document, panel) {
        open(createPanelShell(provider, document, panel, host));
      },
    },
    {
      webviewOptions: {
        retainContextWhenHidden: provider.retainContextWhenHidden,
      },
      supportsMultipleEditorsPerDocument: provider.multipleEditorsPerDocument,
    },
  );
  return () => registration.dispose();
}
