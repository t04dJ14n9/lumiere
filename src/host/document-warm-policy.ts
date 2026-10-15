/**
 * Cursor leaves agent-created or agent-edited Markdown notes without a fully
 * initialized TextDocument until they are opened once in the plain text
 * editor. Opening such a note straight into a CustomTextEditorProvider then
 * fails inside Cursor with "Assertion Failed: Argument is 'undefined' or
 * 'null.'" before resolveCustomTextEditor runs. Warming the document through
 * openTextDocument materializes it so the custom editor can resolve.
 *
 * See https://forum.cursor.com/t/assertion-error-when-using-custom-editors-incl-markdown-preview-editors/148578
 */

/** Auto mode matches reclaim: only Cursor needs the warm. */
export function documentWarmEnabled({
  mode,
  appName,
}: {
  mode: "auto" | "on" | "off";
  appName: string;
}): boolean {
  if (mode === "auto") {
    return /cursor/i.test(appName);
  }
  return mode === "on";
}

/** Notes on disk that our custom editor may open. */
export function isWarmableMarkdown(uri: string): boolean {
  return /^file:/i.test(uri) && /\.(md|markdown)$/i.test(uri);
}

/**
 * Whether a URI still needs warming. Already-open documents are initialized.
 */
export function shouldWarmUri(
  uri: string,
  openUris: ReadonlySet<string>,
): boolean {
  return isWarmableMarkdown(uri) && !openUris.has(uri);
}

/**
 * Deduplicated warmable change URIs that still need materialization.
 * Already-open entries are omitted so they do not consume a warm budget.
 */
export function collectGitWarmTargets(
  changeUris: readonly string[],
  openUris: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const uri of changeUris) {
    if (seen.has(uri) || !shouldWarmUri(uri, openUris)) {
      continue;
    }
    seen.add(uri);
    out.push(uri);
  }
  return out;
}

/**
 * Next concurrency batch from a drained target list. `limit` is a batch size,
 * not a permanently selected prefix of the dirty set.
 */
export function nextWarmBatch(
  targets: readonly string[],
  offset: number,
  limit: number,
): { batch: readonly string[]; nextOffset: number } {
  const batch = targets.slice(offset, offset + Math.max(0, limit));
  return { batch, nextOffset: offset + batch.length };
}
