/**
 * Pure helpers for reclaiming VS Code Explorer open-on-drop (no Shift).
 *
 * Workbench sets pointer-events:none on custom-editor webviews while Explorer
 * resources are dragged, unless Shift is held. Without Shift the drop opens
 * the file as a pinned tab instead of reaching the webview (EditorDropTarget
 * forces `pinned: true`). The host watches tab opens and converts matching
 * pinned media tabs back into attachments.
 *
 * There is no extension API to receive Explorer drops without Shift on a
 * custom-editor webview; reclaim is the supported workaround.
 */

const ATTACHABLE =
  /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp|pdf|flac|m4a|mp3|ogg|opus|wav|mov|mp4|webm)$/i;

/** True when a workspace path looks like a media/attachment drop, not a note. */
export function isAttachableExplorerPath(path: string): boolean {
  const base = path.split(/[/\\]/).pop() ?? "";
  return ATTACHABLE.test(base);
}

export interface ExplorerOpenFacts {
  readonly openedPath: string;
  /**
   * Preview tabs (typical Explorer single-click). Explorer tree drops open
   * pinned (`isPreview: false`) via EditorDropTarget.
   */
  readonly isPreview: boolean;
  /** The editor group still has a Lumière markdown custom editor. */
  readonly groupHadLumiereNote: boolean;
  /** Before this open, that group's active editor was the Lumière note. */
  readonly priorActiveWasLumiere: boolean;
}

/**
 * True when an opened tab is almost certainly Explorer drop-without-Shift onto
 * a Lumière note (webview never saw the drop). Preview (single-click) opens
 * and non-media files are left alone.
 */
export function shouldReclaimExplorerOpen(facts: ExplorerOpenFacts): boolean {
  return (
    !facts.isPreview &&
    facts.groupHadLumiereNote &&
    facts.priorActiveWasLumiere &&
    isAttachableExplorerPath(facts.openedPath)
  );
}
