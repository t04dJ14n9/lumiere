import * as vscode from "vscode";
import {
  documentWarmEnabled,
  isWarmableMarkdown,
  shouldWarmUri,
} from "./document-warm-policy";

/**
 * Cap how many notes one git-status sweep opens. Vaults can have many dirty
 * notes; explorer clicks only need the ones the user is about to open, and
 * the watcher covers the rest as they change.
 */
const GIT_WARM_LIMIT = 64;

/** The slice of vscode.git API 1 used to find dirty Markdown notes. */
interface GitChange {
  readonly uri: vscode.Uri;
}
interface GitRepository {
  readonly state: {
    readonly workingTreeChanges: readonly GitChange[];
    readonly indexChanges: readonly GitChange[];
    readonly mergeChanges?: readonly GitChange[];
    readonly onDidChange: vscode.Event<void>;
  };
}
interface GitApi {
  readonly state: "uninitialized" | "initialized";
  readonly onDidChangeState: vscode.Event<"uninitialized" | "initialized">;
  readonly repositories: readonly GitRepository[];
  readonly onDidOpenRepository: vscode.Event<GitRepository>;
}
interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitApi;
}

function warmSetting(): "auto" | "on" | "off" {
  return vscode.workspace
    .getConfiguration("markdownWorkbench")
    .get<"auto" | "on" | "off">("editor.warmTextDocument", "auto");
}

function enabled(): boolean {
  return documentWarmEnabled({
    mode: warmSetting(),
    appName: vscode.env.appName,
  });
}

/**
 * Cursor: keep Markdown TextDocuments materialized so a custom editor open
 * does not hit Cursor's uninitialized-document assertion. No-op when the
 * setting is off, or in auto mode outside Cursor.
 */
export function registerDocumentWarm(): vscode.Disposable {
  const pending = new Set<string>();
  const warm = (uri: vscode.Uri) => {
    if (!enabled()) {
      return;
    }
    const key = uri.toString();
    const open = new Set(
      vscode.workspace.textDocuments.map((document) => document.uri.toString()),
    );
    if (!shouldWarmUri(key, open) || pending.has(key)) {
      return;
    }
    pending.add(key);
    void Promise.resolve(vscode.workspace.openTextDocument(uri))
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        pending.delete(key);
      });
  };

  const watcher =
    vscode.workspace.createFileSystemWatcher("**/*.{md,markdown}");
  const subscriptions: vscode.Disposable[] = [
    watcher,
    watcher.onDidCreate(warm),
    watcher.onDidChange(warm),
    vscode.workspace.onDidCreateFiles((event) => {
      for (const file of event.files) {
        warm(file);
      }
    }),
  ];

  const gitStop = watchGit(warm);
  if (gitStop) {
    subscriptions.push({ dispose: gitStop });
  }

  return vscode.Disposable.from(...subscriptions);
}

/**
 * Materialize the TextDocument before vscode.openWith to our editor. Safe to
 * call from any host; cheap when the document is already open.
 */
export async function warmMarkdownDocument(uri: vscode.Uri): Promise<void> {
  if (!isWarmableMarkdown(uri.toString())) {
    return;
  }
  try {
    await vscode.workspace.openTextDocument(uri);
  } catch {
    // Missing or unreadable notes still go through openWith's own errors.
  }
}

/** Dirty and merge notes from every open repository, capped. */
function watchGit(warm: (uri: vscode.Uri) => void): (() => void) | undefined {
  let live = true;
  const seen = new Set<GitRepository>();
  const subscriptions: vscode.Disposable[] = [];

  const sweep = (repository: GitRepository) => {
    const changes = [
      ...repository.state.workingTreeChanges,
      ...repository.state.indexChanges,
      ...(repository.state.mergeChanges ?? []),
    ];
    let count = 0;
    for (const change of changes) {
      if (count >= GIT_WARM_LIMIT) {
        break;
      }
      if (isWarmableMarkdown(change.uri.toString())) {
        warm(change.uri);
        count++;
      }
    }
  };

  const attach = (repository: GitRepository) => {
    if (seen.has(repository)) {
      return;
    }
    seen.add(repository);
    subscriptions.push(repository.state.onDidChange(() => sweep(repository)));
    sweep(repository);
  };

  void loadGitApi().then((api) => {
    if (!live || !api) {
      return;
    }
    for (const repository of api.repositories) {
      attach(repository);
    }
    subscriptions.push(
      api.onDidOpenRepository((repository) => attach(repository)),
    );
  });

  return () => {
    live = false;
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
  };
}

async function loadGitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) {
    return undefined;
  }
  const exports = extension.isActive
    ? extension.exports
    : await extension.activate();
  if (!exports?.enabled) {
    return undefined;
  }
  const api = exports.getAPI(1);
  if (api.state === "initialized") {
    return api;
  }
  await new Promise<void>((resolve) => {
    const listener = api.onDidChangeState((state) => {
      if (state === "initialized") {
        listener.dispose();
        resolve();
      }
    });
  });
  return api;
}
