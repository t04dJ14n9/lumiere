import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { Disposer } from "../kernel";
import type { DiffPanel, DiffSide, DiffViews, OpenedDiff } from "../shared/git";

type ShowOptions = Parameters<DiffViews["show"]>[0];

const BYPASS_MS = 10_000;
const isMarkdown = (uri: vscode.Uri) => /\.(md|markdown)$/i.test(uri.path);
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const pairKey = (original: vscode.Uri, modified: vscode.Uri) =>
  `${original.toString()}|${modified.toString()}`;

/** VS Code's diff tabs and the rendered diff panel, for the gitDiffEditor plugin. */
export function createDiffViews(extensionUri: vscode.Uri): DiffViews {
  /** Diffs this extension opened natively (the panel's "Text Diff"); not taken over. */
  const native = new Map<string, number>();
  return {
    onDidOpenDiff: (listener) => watchDiffTabs(native, listener),
    async openNative(original, modified, title, column) {
      const left = vscode.Uri.parse(original);
      const right = vscode.Uri.parse(modified);
      native.set(pairKey(left, right), Date.now());
      await vscode.commands.executeCommand("vscode.diff", left, right, title, {
        ...(column !== undefined && { viewColumn: column }),
      });
    },
    show: (options) => showPanel(extensionUri, options),
  };
}

function watchDiffTabs(
  native: Map<string, number>,
  listener: (diff: OpenedDiff) => void,
): Disposer {
  const subscription = vscode.window.tabGroups.onDidChangeTabs((event) => {
    for (const tab of event.opened) {
      const diff = openedDiff(native, tab);
      if (diff) {
        listener(diff);
      }
    }
  });
  return () => subscription.dispose();
}

function openedDiff(
  native: Map<string, number>,
  tab: vscode.Tab,
): OpenedDiff | undefined {
  const input = tab.input;
  if (
    !(input instanceof vscode.TabInputTextDiff) ||
    !isMarkdown(input.modified)
  ) {
    return undefined;
  }
  const bypass = native.get(pairKey(input.original, input.modified));
  if (bypass && Date.now() - bypass < BYPASS_MS) {
    return undefined;
  }
  return {
    original: input.original.toString(),
    modified: input.modified.toString(),
    column: tab.group.viewColumn,
    preview: tab.isPreview,
    close: async () => {
      if (tab.isDirty) {
        return false;
      }
      return vscode.window.tabGroups.close(tab, true);
    },
  };
}

function panelHtml(webview: vscode.Webview, dist: vscode.Uri): string {
  const asset = (relative: string) =>
    escape(
      webview.asWebviewUri(vscode.Uri.joinPath(dist, relative)).toString(),
    );
  const nonce = randomBytes(24).toString("base64");
  const source = webview.cspSource;
  const policy = `default-src 'none'; script-src 'nonce-${nonce}' ${source}; style-src ${source} 'unsafe-inline'; img-src ${source} data:; font-src ${source} data:;`;
  return [
    `<!doctype html><html><head><meta charset="UTF-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${escape(policy)}">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<link rel="stylesheet" href="${asset("webview/editor.css")}">`,
    `<link rel="stylesheet" href="${asset("webview/diff.css")}">`,
    `</head><body><main id="app" class="mw-diff-app"></main>`,
    `<script type="module" nonce="${nonce}" src="${asset("webview/diff.js")}"></script>`,
    `</body></html>`,
  ].join("");
}

function showPanel(extensionUri: vscode.Uri, options: ShowOptions): DiffPanel {
  const dist = vscode.Uri.joinPath(extensionUri, "dist");
  const panel = vscode.window.createWebviewPanel(
    "markdownWorkbench.renderedDiff",
    options.title,
    {
      viewColumn: options.column ?? vscode.ViewColumn.Active,
      preserveFocus: false,
    },
    {
      enableScripts: true,
      localResourceRoots: [dist],
      retainContextWhenHidden: true,
    },
  );
  panel.webview.html = panelHtml(panel.webview, dist);
  return new RenderedDiffPanel(panel, options);
}

/** The webview half's state: the latest sides, posted once it is ready. */
class RenderedDiffPanel implements DiffPanel {
  private latest: { left: DiffSide; right: DiffSide };
  private ready = false;
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions: vscode.Disposable[];
  constructor(
    private readonly panel: vscode.WebviewPanel,
    options: ShowOptions,
  ) {
    this.latest = { left: options.left, right: options.right };
    this.subscriptions = [
      panel.webview.onDidReceiveMessage(
        (message: { type?: string; action?: string }) => {
          if (message.type === "ready") {
            this.ready = true;
            this.post();
          } else if (
            message.type === "action" &&
            (message.action === "openFile" || message.action === "openNative")
          ) {
            options.onAction(message.action);
          }
        },
      ),
      panel.onDidDispose(() => this.disposed()),
    ];
  }
  update(left: DiffSide, right: DiffSide): void {
    this.latest = { left, right };
    this.post();
  }
  onDispose(listener: () => void): Disposer {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispose(): void {
    this.panel.dispose();
  }
  private post(): void {
    if (this.ready) {
      void this.panel.webview.postMessage({ type: "update", ...this.latest });
    }
  }
  private disposed(): void {
    for (const listener of this.listeners) {
      listener();
    }
    this.listeners.clear();
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }
}
