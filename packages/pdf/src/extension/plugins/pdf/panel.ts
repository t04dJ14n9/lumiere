import * as vscode from "vscode";
import type { PdfWebview } from "../../../shared/host";
import {
  PdfViewerPanel,
  type PluginMessage,
  type ViewerPanelHost,
  type ViewerPanelOptions,
} from "../../../host/viewer/panel";
import { vscodePdfFiles } from "./files";

export type { PluginMessage } from "../../../host/viewer/panel";

export interface PanelOptions extends Omit<ViewerPanelOptions, "route"> {
  extensionUri: vscode.Uri;
  /** Hand a message the panel does not handle itself to the plugin that does. */
  route(message: PluginMessage): Promise<void>;
}

/**
 * One open PDF editor in VS Code: the viewer core (`PdfViewerPanel`) on a
 * webview panel, with the file as VS Code's `Uri` for the plugins that
 * still use VS Code directly.
 */
export class PdfPanel extends PdfViewerPanel implements vscode.Disposable {
  constructor(
    readonly uri: vscode.Uri,
    readonly webviewPanel: vscode.WebviewPanel,
    options: PanelOptions,
  ) {
    super(
      uri.toString(),
      webviewPort(webviewPanel.webview, options.extensionUri),
      VSCODE_PANEL_HOST,
      options,
    );
  }
}

const VSCODE_PANEL_HOST: ViewerPanelHost = {
  files: vscodePdfFiles,
  error: (message) => void vscode.window.showErrorMessage(message),
  openExternal: async (url) => {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  },
  refocus: () =>
    void vscode.commands
      .executeCommand("workbench.action.focusActiveEditorGroup")
      .then(undefined, () => undefined),
};

/** The viewer's webview, which may load only the built viewer's files. */
function webviewPort(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): PdfWebview {
  const root = vscode.Uri.joinPath(extensionUri, "dist", "pdf", "webview");
  webview.options = { enableScripts: true, localResourceRoots: [root] };
  return {
    cspSource: webview.cspSource,
    asset: (name) =>
      webview.asWebviewUri(vscode.Uri.joinPath(root, name)).toString(),
    setHTML: (html) => {
      webview.html = html;
    },
    post: (message) => void webview.postMessage(message),
    onMessage: (listener) => {
      const subscription = webview.onDidReceiveMessage(listener);
      return () => subscription.dispose();
    },
  };
}
