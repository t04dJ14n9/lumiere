import { diffImageUrl, diffResourceRoots } from "./diff-image-url";
import {
  diffImageRequest,
  diffImageReply,
  diffUpdate,
  diffReady,
  diffAction,
  parseDiffMessage,
} from "../shared/diff-panel-protocol";
import { bytesToBase64 } from "@workshop/platform";
import * as vscode from "vscode";
import type { Disposer } from "@workshop/core";
import { contributionId } from "../shared/setting-schema";
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
      // The tab as it is now: Cursor replaces tab objects while a diff
      // settles, and refuses to close the one the open event reported.
      const current = currentDiffTab(tab, input) ?? tab;
      if (current.isDirty) {
        return false;
      }
      return vscode.window.tabGroups.close(current, true);
    },
  };
}

/** The open tab showing the same diff, in the tab's group first. */
export function currentDiffTab(
  tab: Pick<vscode.Tab, "group">,
  input: { original: vscode.Uri; modified: vscode.Uri },
  groups: readonly vscode.TabGroup[] = vscode.window.tabGroups.all,
): vscode.Tab | undefined {
  const same = (candidate: vscode.Tab) =>
    candidate.input instanceof vscode.TabInputTextDiff &&
    candidate.input.original.toString() === input.original.toString() &&
    candidate.input.modified.toString() === input.modified.toString();
  const ordered = [
    ...groups.filter((group) => group.viewColumn === tab.group.viewColumn),
    ...groups.filter((group) => group.viewColumn !== tab.group.viewColumn),
  ];
  for (const group of ordered) {
    const match = group.tabs.find(same);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function panelHtml(webview: vscode.Webview, dist: vscode.Uri): string {
  const asset = (relative: string) =>
    escape(
      webview.asWebviewUri(vscode.Uri.joinPath(dist, relative)).toString(),
    );
  const nonce = bytesToBase64(crypto.getRandomValues(new Uint8Array(24)));
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
  const dist = vscode.Uri.joinPath(extensionUri, "dist", "markdown");
  const panel = vscode.window.createWebviewPanel(
    contributionId("renderedDiff"),
    options.title,
    {
      viewColumn: options.column ?? vscode.ViewColumn.Active,
      preserveFocus: false,
    },
    {
      enableScripts: true,
      localResourceRoots: diffResourceRoots(
        dist.toString(),
        options.resources?.roots ?? [],
      ).map((root) => vscode.Uri.parse(root)),
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
  private isDisposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions: vscode.Disposable[];
  constructor(
    private readonly panel: vscode.WebviewPanel,
    options: ShowOptions,
  ) {
    this.latest = { left: options.left, right: options.right };
    this.subscriptions = [
      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (parseDiffMessage(diffImageRequest, message)) {
          void this.resolveImage(message, options);
        } else if (parseDiffMessage(diffReady, message)) {
          this.ready = true;
          this.post();
        } else {
          const action = parseDiffMessage(diffAction, message);
          if (action) {
            options.onAction(action.action);
          }
        }
      }),
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
      void this.panel.webview.postMessage(
        diffUpdate.parse({ type: "update", ...this.latest }),
      );
    }
  }
  private async resolveImage(
    message: unknown,
    options: ShowOptions,
  ): Promise<void> {
    try {
      const request = diffImageRequest.parse(message);
      let url = "";
      try {
        const resource = await options.resources?.load(
          request.side,
          request.target,
        );
        if (resource) {
          url = await diffImageUrl(resource, {
            read: async (uri) =>
              vscode.workspace.fs.readFile(vscode.Uri.parse(uri)),
            localUrl: (uri) =>
              this.panel.webview.asWebviewUri(vscode.Uri.parse(uri)).toString(),
          });
        }
      } catch {
        // Missing, rejected or unavailable revision images retain their source fallback.
      }
      if (!this.isDisposed) {
        void this.panel.webview.postMessage(
          diffImageReply.parse({ type: "image", id: request.id, url }),
        );
      }
    } catch {
      // Untrusted malformed requests are ignored.
    }
  }
  private disposed(): void {
    this.isDisposed = true;
    for (const listener of this.listeners) {
      listener();
    }
    this.listeners.clear();
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }
}
