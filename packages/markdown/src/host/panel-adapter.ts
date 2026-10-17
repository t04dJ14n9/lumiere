import * as vscode from "vscode";
import type { Disposer } from "@workshop/core";
import type { WorkshopPanel } from "../shared/runtime";

/** One webview panel per view type, independent of any Markdown document. */
export function createWorkshopPanel(
  extensionUri: vscode.Uri,
): (viewType: string, title: string) => WorkshopPanel {
  const open = new Map<string, vscode.WebviewPanel>();
  return (viewType, title) => {
    const existing = open.get(viewType);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active);
      return wrap(existing, extensionUri);
    }
    const panel = vscode.window.createWebviewPanel(
      viewType,
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "markdown"),
        ],
      },
    );
    open.set(viewType, panel);
    panel.onDidDispose(() => open.delete(viewType));
    return wrap(panel, extensionUri);
  };
}

function wrap(
  panel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
): WorkshopPanel {
  const dist = vscode.Uri.joinPath(extensionUri, "dist", "markdown");
  return {
    reveal: () => panel.reveal(vscode.ViewColumn.Active),
    setTitle: (title) => {
      panel.title = title;
    },
    get visible() {
      return panel.visible;
    },
    onDidChangeVisibility: (listener) =>
      listen(
        panel.onDidChangeViewState((event) =>
          listener(event.webviewPanel.visible),
        ),
      ),
    onDispose: (listener) => listen(panel.onDidDispose(listener)),
    dispose: () => panel.dispose(),
    webview: {
      cspSource: panel.webview.cspSource,
      asset: (relative) =>
        panel.webview
          .asWebviewUri(vscode.Uri.joinPath(dist, relative))
          .toString(),
      setHTML: (html) => {
        panel.webview.html = html;
      },
      post: (message) => {
        void panel.webview.postMessage(message);
      },
      onMessage: (listener) =>
        listen(panel.webview.onDidReceiveMessage(listener)),
    },
  };
}

function listen(subscription: vscode.Disposable): Disposer {
  return () => subscription.dispose();
}
