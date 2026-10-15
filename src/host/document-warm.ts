import * as vscode from "vscode";
import {
  createDocumentWarmer,
  warmMarkdownDocumentFor,
  type DocumentWarmHost,
} from "./document-warm-core";

export type { DocumentWarmHost } from "./document-warm-core";
export {
  createDocumentWarmer,
  warmMarkdownDocumentFor,
} from "./document-warm-core";

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

function vscodeWarmHost(): DocumentWarmHost {
  return {
    appName: vscode.env.appName,
    warmMode(resourceUri) {
      return vscode.workspace
        .getConfiguration("markdownWorkbench", vscode.Uri.parse(resourceUri))
        .get<"auto" | "on" | "off">("editor.warmTextDocument", "auto");
    },
    openTextDocument(uri) {
      return Promise.resolve(
        vscode.workspace.openTextDocument(vscode.Uri.parse(uri)),
      ).then(() => undefined);
    },
    textDocumentUris() {
      return new Set(
        vscode.workspace.textDocuments.map((document) =>
          document.uri.toString(),
        ),
      );
    },
  };
}

/**
 * Cursor: keep Markdown TextDocuments materialized so a custom editor open
 * does not hit Cursor's uninitialized-document assertion. No-op when the
 * setting is off, or in auto mode outside Cursor. Resource-scoped overrides
 * apply per target URI.
 */
export function registerDocumentWarm(): vscode.Disposable {
  const host = vscodeWarmHost();
  const { warm, warmOpenedDocument, warmGitChanges } =
    createDocumentWarmer(host);

  const watcher =
    vscode.workspace.createFileSystemWatcher("**/*.{md,markdown}");
  const subscriptions: vscode.Disposable[] = [
    watcher,
    watcher.onDidCreate((uri) => warm(uri.toString())),
    watcher.onDidChange((uri) => warm(uri.toString())),
    vscode.workspace.onDidOpenTextDocument((document) => {
      // Associations can transfer a built-in editor without our openWith path.
      warmOpenedDocument(document.uri.toString());
    }),
    vscode.workspace.onDidCreateFiles((event) => {
      for (const file of event.files) {
        warm(file.toString());
      }
    }),
  ];

  // The document that activates onLanguage:markdown may already be open.
  for (const document of vscode.workspace.textDocuments) {
    warmOpenedDocument(document.uri.toString());
  }

  const gitStop = watchGit(warmGitChanges);
  if (gitStop) {
    subscriptions.push({ dispose: gitStop });
  }

  return vscode.Disposable.from(...subscriptions);
}

/**
 * Materialize the TextDocument before vscode.openWith to our editor. Obeys
 * the resource-scoped warm setting (including `off` and non-Cursor `auto`).
 */
export async function warmMarkdownDocument(uri: vscode.Uri): Promise<void> {
  await warmMarkdownDocumentFor(uri.toString(), vscodeWarmHost());
}

/** Dirty and merge notes from every open repository, drained in batches. */
function watchGit(
  warmGitChanges: (changeUris: readonly string[], live: () => boolean) => void,
): (() => void) | undefined {
  let live = true;
  const seen = new Set<GitRepository>();
  const subscriptions: vscode.Disposable[] = [];

  const sweep = (repository: GitRepository) => {
    const changes = [
      ...repository.state.workingTreeChanges,
      ...repository.state.indexChanges,
      ...(repository.state.mergeChanges ?? []),
    ];
    warmGitChanges(
      changes.map((change) => change.uri.toString()),
      () => live,
    );
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
