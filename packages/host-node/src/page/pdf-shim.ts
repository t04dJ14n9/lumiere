/**
 * Stands in for the PDF viewer's extension host in a page of the web and iPad
 * apps (host-web, `openPdfPage`), where no extension runs. When the viewer
 * says it is ready, this hands it the PDF's bytes, from the blob URL the page
 * names (`PDF_META`), with the viewer's default settings. The viewer's
 * reports (its state, selection and history) have no host to go to and are
 * dropped. The embedder's theme applies as in an editor page (shim.ts). Runs
 * before the viewer (packages/pdf/src/shared/viewer-page.ts, `before`).
 */
import { isEmbeddingMessage, parseThemeMessage, PDF_META } from "../embedding";
import { applyTheme, followSystemTheme } from "./theme";

const stopFollowingSystem = followSystemTheme();

// Registered before the viewer's own listener, which must not see these.
window.addEventListener("message", (event) => {
  if (!isEmbeddingMessage(event.data)) {
    return;
  }
  event.stopImmediatePropagation();
  if (event.source !== window.parent || event.origin !== location.origin) {
    return;
  }
  const theme = parseThemeMessage(event.data);
  if (theme) {
    stopFollowingSystem();
    applyTheme(theme);
  }
});

let loads = 0;
window.acquireVsCodeApi = () => ({
  postMessage(message: unknown) {
    const type = isRecord(message) ? message.type : undefined;
    if (type === "ready") {
      void load();
    } else if (type === "error" && isRecord(message)) {
      console.error("Lumière PDF:", message.message);
    }
  },
  getState: () => undefined,
  setState: () => {},
});

/** Send the viewer the PDF, as the extension's `load` message does. */
async function load(): Promise<void> {
  const source = document.querySelector<HTMLMetaElement>(
    `meta[name="${PDF_META}"]`,
  )?.content;
  if (!source) {
    console.error("Lumière PDF: the page names no PDF");
    return;
  }
  const data = await (await fetch(source)).arrayBuffer();
  window.postMessage(
    { type: "load", load: ++loads, data, settings: {} },
    location.origin,
    [data],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
