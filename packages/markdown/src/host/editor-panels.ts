import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { EditorProvider } from "../shared/editor-provider";
import type { PanelShell } from "../shared/host";
import { SourceCoordinates } from "../shared/document/coordinates";
import { panelIsActive } from "./active-panel";
import type { NativeNavigation } from "./navigation";
import type { NativeDocuments } from "./services/native-documents";

/**
 * The VS Code side of an editor panel: registration, the webview, its
 * transport and its active state, for any `EditorProvider`. Invariant:
 * nothing here depends on the document's language; what the panel shows is
 * the editor plugin's business.
 */
interface EditorHost {
  extension?: unknown;
  extensionUri: vscode.Uri;
  documents: NativeDocuments;
  navigation?: NativeNavigation;
}

const CUSTOM_TEXT_EDITOR_NAVIGATION_PROPOSAL = "customTextEditorNavigation";
const panelIds = new WeakMap<vscode.WebviewPanel, string>();

function idForPanel(panel: vscode.WebviewPanel): string {
  let id = panelIds.get(panel);
  if (!id) {
    id = randomUUID();
    panelIds.set(panel, id);
  }
  return id;
}

function addApiProposal(target: unknown, proposal: string): void {
  if (!target || typeof target !== "object") {
    return;
  }
  const record = target as { enabledApiProposals?: unknown };
  const current = Array.isArray(record.enabledApiProposals)
    ? record.enabledApiProposals.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  if (!current.includes(proposal)) {
    try {
      record.enabledApiProposals = [...current, proposal];
    } catch {
      // Ignore frozen test fixtures.
    }
  }
}

function enableCustomTextEditorNavigation(extension: unknown): void {
  addApiProposal(extension, CUSTOM_TEXT_EDITOR_NAVIGATION_PROPOSAL);
  if (
    extension &&
    typeof extension === "object" &&
    "packageJSON" in extension
  ) {
    addApiProposal(
      (extension as { packageJSON?: unknown }).packageJSON,
      CUSTOM_TEXT_EDITOR_NAVIGATION_PROPOSAL,
    );
  }
}

const noopDisposable = { dispose() {} };

function noopSelectionEvent(
  _listener: (value: vscode.Selection | undefined) => unknown,
  _thisArgs?: unknown,
  disposables?: {
    push?(d: { dispose(): void }): unknown;
    add?(d: { dispose(): void }): unknown;
  },
): { dispose(): void } {
  if (Array.isArray(disposables)) {
    disposables.push(noopDisposable);
  } else if (disposables && typeof disposables.add === "function") {
    disposables.add(noopDisposable);
  }
  return noopDisposable;
}

function createCustomEditorNavigation(
  document: vscode.TextDocument,
  panel: vscode.WebviewPanel,
  navigation: NativeNavigation | undefined,
) {
  const panelId = idForPanel(panel);
  return {
    selection: undefined,
    onDidChangeSelection: noopSelectionEvent,
    async revealRange(
      range: vscode.Range,
      _options?: unknown,
      token?: vscode.CancellationToken,
    ): Promise<void> {
      if (!navigation || token?.isCancellationRequested) {
        return;
      }
      const coordinates = new SourceCoordinates(document.getText());
      const at = coordinates.toEditor(document.offsetAt(range.start));
      const endOffset = coordinates.toEditor(document.offsetAt(range.end));
      const target = endOffset > at ? { at, to: endOffset } : at;
      const intent = navigation.begin();
      const cancel = token?.onCancellationRequested?.(() => {
        intent.token.cancel();
      });
      try {
        if (navigation.revealPanel) {
          await navigation.revealPanel(panelId, target, intent);
        } else {
          await navigation.revealOpened(
            document.uri.toString(),
            panel.viewColumn ?? 1,
            target,
            intent,
          );
        }
      } finally {
        cancel?.dispose?.();
      }
    },
    async captureViewState(): Promise<undefined> {
      return undefined;
    },
    async restoreViewState(): Promise<void> {},
    dispose(): void {},
  };
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
  const root =
    vscode.workspace.getWorkspaceFolder(document.uri)?.uri ??
    vscode.Uri.joinPath(document.uri, "..");
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.joinPath(extensionUri, "dist", "markdown"),
      root,
    ],
  };

  return {
    id: idForPanel(panel),
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
        .asWebviewUri(
          vscode.Uri.joinPath(extensionUri, "dist", "markdown", relative),
        )
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
  enableCustomTextEditorNavigation(host.extension);
  const registration = vscode.window.registerCustomEditorProvider(
    provider.viewType,
    {
      resolveCustomTextEditor(document, panel) {
        open(createPanelShell(provider, document, panel, host));
      },
      resolveCustomTextEditorNavigation(
        document: vscode.TextDocument,
        panel: vscode.WebviewPanel,
      ) {
        return createCustomEditorNavigation(document, panel, host.navigation);
      },
    } as vscode.CustomTextEditorProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: provider.retainContextWhenHidden,
      },
      supportsMultipleEditorsPerDocument: provider.multipleEditorsPerDocument,
    },
  );
  return () => registration.dispose();
}
