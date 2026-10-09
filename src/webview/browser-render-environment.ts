/**
 * The real PdfRenderSession environment: EmbedPDF's PDFium engines, fetch and
 * blob URLs. Kept apart from render-session.ts so that file has no browser or
 * EmbedPDF imports and can be unit-tested under Node.
 */
import type { PdfEngine } from '@embedpdf/models';
import type { EngineMode, RenderSessionEnvironment } from './render-session';

export type ViewerEngine = PdfEngine<Blob>;

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
  destroyEngine(engine) {
    const destroy = (): void => {
      try {
        engine.destroy?.();
      } catch (error) {
        console.warn('Could not stop the PDF engine', error);
      }
    };
    engine.closeAllDocuments().wait(destroy, destroy);
  },
  async fetchWasm(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PDFium request failed (${response.status})`);
    return response.blob();
  },
  createObjectUrl: blob => URL.createObjectURL(blob),
  revokeObjectUrl: url => URL.revokeObjectURL(url),
};
