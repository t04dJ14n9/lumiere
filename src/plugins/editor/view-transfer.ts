import type { EditorPanel, ViewSnapshot } from "./api";
import { protocol } from "./protocol";
/** Capture by panel identity; two panels of a note never overwrite each other. */
export async function captureView(panel: EditorPanel): Promise<ViewSnapshot> {
  await panel.session.flush();
  const version = panel.document.version;
  const state = await panel.rpc.call(protocol, "captureView", {});
  if (panel.document.version !== version) {
    throw new Error("The document changed while capturing its view");
  }
  return {
    editorId: panel.id,
    documentUri: panel.document.uri,
    documentVersion: version,
    state,
  };
}
export async function restoreView(
  panel: EditorPanel,
  captured: ViewSnapshot,
): Promise<void> {
  // The state retains its old source URI so disclosure keys can be remapped on rename.
  await panel.rpc.call(protocol, "restoreView", captured.state);
}
