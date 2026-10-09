/**
 * The PDF viewer page. It asks the extension for the PDF, then starts the
 * engine and the viewer. A new `load` (the file changed) restarts both.
 *
 *   host.ts              messages to and from the extension
 *   render-session.ts    what one loaded PDF holds (bytes, engines, blob
 *                        URLs), disposed when the next one arrives
 *   engine.tsx           PDFium startup (worker, with a main-thread fallback)
 *   viewer.tsx           toolbar, search and pages
 */
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { browserRenderEnvironment, warmWasm, type ViewerEngine } from './browser-render-environment';
import { PdfEngine, Status } from './engine';
import { connectToHost } from './host';
import { PdfRenderSession } from './render-session';
import '@vscode/codicons/dist/codicon.css';
import './styles/base.css';
import './styles/toolbar.css';
import './styles/page.css';

performance.mark('pdf:main');
const container = document.getElementById('root');
if (!container) throw new Error('The viewer page has no #root element');
const wasmUrl = container.dataset.pdfiumWasm;
// Load-time marks (see test/vscode/perf.spec.ts): the first rendered page image.
container.addEventListener(
  'load',
  event => {
    if (event.target instanceof Element && event.target.classList.contains('page-image')) performance.mark('pdf:first-page');
  },
  { capture: true, once: false },
);
const root = createRoot(container);

if (!wasmUrl) {
  root.render(<Status text="The PDF engine is missing from this installation." />);
} else {
  // The engine's WASM downloads while the host sends the PDF.
  warmWasm(wasmUrl).catch(() => undefined);
  let generation = 0;
  let session: PdfRenderSession<ViewerEngine> | undefined;
  root.render(<Status text="Loading the PDF…" />);
  connectToHost(buffer => {
    performance.mark('pdf:buffer');
    const previous = session;
    const next = new PdfRenderSession(buffer, wasmUrl, browserRenderEnvironment);
    session = next;
    // Replace the old viewer first (flushSync unmounts it now), so nothing
    // still on screen uses the engines the old session is about to stop.
    flushSync(() => root.render(<PdfEngine key={++generation} session={next} />));
    void previous?.dispose(); // never rejects: failures go to reportError
  });
  window.addEventListener('pagehide', () => {
    void session?.dispose();
  });
}
