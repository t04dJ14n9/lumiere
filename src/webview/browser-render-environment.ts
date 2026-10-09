/**
 * The real PdfRenderSession environment: EmbedPDF's PDFium engines, fetch and
 * blob URLs. Kept apart from render-session.ts so that file has no browser or
 * EmbedPDF imports and can be unit-tested under Node.
 */
import type { PdfEngine } from '@embedpdf/models';
import { stopEngine } from './engine-destruction';
import type { EngineMode, RenderSessionEnvironment } from './render-session';

/** How long an engine gets to close its documents before it is destroyed anyway. */
const ENGINE_STOP_DEADLINE_MS = 2000;

export type ViewerEngine = PdfEngine<Blob>;

/**
 * The WASM blob, fetched once. `warmWasm` starts the fetch while the host is
 * still sending the PDF, so the engine need not wait for it; a failed fetch
 * is forgotten so the next attempt tries again.
 */
const wasmBlobs = new Map<string, Promise<Blob>>();
export function warmWasm(url: string): Promise<Blob> {
  let blob = wasmBlobs.get(url);
  if (!blob) {
    blob = fetch(url).then(response => {
      if (!response.ok) throw new Error(`PDFium request failed (${response.status})`);
      return response.blob();
    });
    wasmBlobs.set(url, blob);
    blob.catch(() => wasmBlobs.delete(url));
  }
  return blob;
}

export const browserRenderEnvironment: RenderSessionEnvironment<ViewerEngine> = {
  async createEngine(mode: EngineMode, wasmUrl: string) {
    const worker = mode === 'worker';
    const { createPdfiumEngine } = worker
      ? await import('@embedpdf/engines/pdfium-worker-engine')
      : await import('@embedpdf/engines/pdfium-direct-engine');
    return createPdfiumEngine(wasmUrl, {
      encoderPoolSize: worker ? 1 : 0,
      // Never fetch fallback fonts from the network; the viewer works offline.
      fontFallback: null,
    });
  },
  destroyEngine: engine => stopEngine(engine, ENGINE_STOP_DEADLINE_MS),
  reportError: (message, error) => console.warn(message, error),
  fetchWasm: warmWasm,
  createObjectUrl: blob => URL.createObjectURL(blob),
  revokeObjectUrl: url => URL.revokeObjectURL(url),
};
