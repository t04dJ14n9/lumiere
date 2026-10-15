import {
  collectGitWarmTargets,
  documentWarmEnabled,
  isWarmableMarkdown,
  nextWarmBatch,
  shouldWarmUri,
} from "./document-warm-policy";

/**
 * Host surface used by the warmer so unit tests can assert openTextDocument
 * call counts without loading the real VS Code API.
 */
export interface DocumentWarmHost {
  readonly appName: string;
  /** Resource-scoped `editor.warmTextDocument` for the target URI. */
  warmMode(resourceUri: string): "auto" | "on" | "off";
  openTextDocument(uri: string): Promise<void>;
  textDocumentUris(): ReadonlySet<string>;
}

function enabledFor(host: DocumentWarmHost, uri: string): boolean {
  return documentWarmEnabled({
    mode: host.warmMode(uri),
    appName: host.appName,
  });
}

async function openOnce(
  host: DocumentWarmHost,
  uri: string,
  pending: Set<string>,
): Promise<void> {
  pending.add(uri);
  try {
    await host.openTextDocument(uri);
  } catch {
    // Missing or unreadable notes are skipped.
  } finally {
    pending.delete(uri);
  }
}

/**
 * Materialize one note when the resource-scoped setting allows it. Safe to
 * call from any host; cheap when the document is already open.
 */
export async function warmMarkdownDocumentFor(
  uri: string,
  host: DocumentWarmHost,
): Promise<void> {
  if (!isWarmableMarkdown(uri) || !enabledFor(host, uri)) {
    return;
  }
  try {
    await host.openTextDocument(uri);
  } catch {
    // Missing or unreadable notes still go through openWith's own errors.
  }
}

/** Drain eligible git targets in bounded concurrency batches. */
async function drainGitWarmTargets(options: {
  host: DocumentWarmHost;
  targets: readonly string[];
  gitLimit: number;
  pending: Set<string>;
  live: () => boolean;
}): Promise<void> {
  const { host, targets, gitLimit, pending, live } = options;
  let offset = 0;
  while (live() && offset < targets.length) {
    const { batch, nextOffset } = nextWarmBatch(targets, offset, gitLimit);
    offset = nextOffset;
    if (batch.length === 0) {
      break;
    }
    await Promise.all(
      batch.map(async (uri) => {
        if (!live() || pending.has(uri)) {
          return;
        }
        if (!shouldWarmUri(uri, host.textDocumentUris())) {
          return;
        }
        if (!enabledFor(host, uri)) {
          return;
        }
        await openOnce(host, uri, pending);
      }),
    );
  }
}

/**
 * Background warmer: create/change and git sweeps. File-watcher and git
 * callers share the same enablement and pending-key rules.
 */
export function createDocumentWarmer(
  host: DocumentWarmHost,
  options: { gitLimit?: number } = {},
): {
  warm: (uri: string) => void;
  warmGitChanges: (changeUris: readonly string[], live: () => boolean) => void;
} {
  const gitLimit = options.gitLimit ?? 64;
  const pending = new Set<string>();

  const warm = (uri: string) => {
    if (!enabledFor(host, uri)) {
      return;
    }
    if (!shouldWarmUri(uri, host.textDocumentUris()) || pending.has(uri)) {
      return;
    }
    void openOnce(host, uri, pending);
  };

  const warmGitChanges = (
    changeUris: readonly string[],
    live: () => boolean,
  ) => {
    const targets = collectGitWarmTargets(
      changeUris,
      host.textDocumentUris(),
    ).filter((uri) => enabledFor(host, uri));
    void drainGitWarmTargets({ host, targets, gitLimit, pending, live });
  };

  return { warm, warmGitChanges };
}
