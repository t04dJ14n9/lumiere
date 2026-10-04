/**
 * The PDF viewer page. It asks the extension for the PDF, then starts the
 * engine and the viewer. A new `load` (the file changed) restarts both.
 *
 *   host.ts      messages to and from the extension
 *   engine.tsx   PDFium startup (worker, with a main-thread fallback)
 *   viewer.tsx   toolbar, search and pages
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PdfEngine, Status } from './engine';
import { connectToHost } from './host';
import './styles/base.css';
import './styles/toolbar.css';
import './styles/page.css';

const container = document.getElementById('root');
if (!container) throw new Error('The viewer page has no #root element');
const wasmUrl = container.dataset.pdfiumWasm;
const root = createRoot(container);

if (!wasmUrl) {
  root.render(<Status text="The PDF engine is missing from this installation." />);
} else {
  let generation = 0;
  root.render(<Status text="Loading the PDF…" />);
  connectToHost(buffer => root.render(<PdfEngine key={++generation} buffer={buffer} wasmUrl={wasmUrl} />));
}
