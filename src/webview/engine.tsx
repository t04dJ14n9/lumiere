import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { DocumentContent } from '@embedpdf/plugin-document-manager/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { postToHost } from './host';
import { DOCUMENT_ID, viewerPlugins } from './plugins';
import { Viewer } from './viewer';

/** A worker that has not opened the PDF within this time is given up. */
const WORKER_TIMEOUT_MS = 15_000;

type EngineMode = 'worker' | 'main-thread';

/**
 * Start PDFium and show `buffer`.
 *
 * PDFium normally runs in a web worker so rendering never blocks scrolling.
 * If the worker cannot start (a blocked blob URL, a failed WASM fetch, a
 * crash, or silence), the engine restarts on the main thread instead.
 */
export function PdfEngine({ buffer, wasmUrl }: { buffer: ArrayBuffer; wasmUrl: string }): React.JSX.Element {
  const [mode, setMode] = useState<EngineMode>('worker');
  const useMainThread = useCallback(() => setMode('main-thread'), []);
  const workerWasmUrl = useWorkerWasmUrl(mode === 'worker' ? wasmUrl : undefined, useMainThread);

  if (mode === 'worker' && !workerWasmUrl) return <Status text="Starting the PDF engine…" />;
  return (
    <EngineSession
      key={mode}
      buffer={buffer}
      mode={mode}
      wasmUrl={mode === 'worker' ? workerWasmUrl! : wasmUrl}
      onWorkerFailure={useMainThread}
    />
  );
}

/**
 * The worker cannot fetch the extension's resource URL itself, so the WASM is
 * fetched here and handed over as a blob URL.
 */
function useWorkerWasmUrl(wasmUrl: string | undefined, onFailure: () => void): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string>();
  useEffect(() => {
    if (!wasmUrl) return;
    let active = true;
    let objectUrl: string | undefined;
    fetch(wasmUrl)
      .then(response => {
        if (!response.ok) throw new Error(`PDFium request failed (${response.status})`);
        return response.blob();
      })
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((error: unknown) => {
        console.warn('Could not prepare PDFium for the worker; using the main thread.', error);
        if (active) onFailure();
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wasmUrl, onFailure]);
  return blobUrl;
}

function EngineSession({ buffer, mode, wasmUrl, onWorkerFailure }: {
  buffer: ArrayBuffer;
  mode: EngineMode;
  wasmUrl: string;
  onWorkerFailure: () => void;
}): React.JSX.Element {
  const worker = mode === 'worker';
  const { engine, error } = usePdfiumEngine({
    worker,
    wasmUrl,
    encoderPoolSize: worker ? 1 : 0,
    // Never fetch fallback fonts from the network; the viewer works offline.
    fontFallback: null,
  });
  const plugins = useMemo(() => viewerPlugins(buffer), [buffer]);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!error) return;
    if (worker) onWorkerFailure();
    else postToHost({ type: 'error', message: `The PDF engine failed: ${String(error)}` });
  }, [error, onWorkerFailure, worker]);

  // Treat a worker that never answers like one that failed.
  useEffect(() => {
    if (!worker || opened) return;
    const timer = window.setTimeout(onWorkerFailure, WORKER_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [onWorkerFailure, opened, worker]);

  if (!engine) return <Status text="Starting the PDF engine…" />;
  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      <DocumentContent documentId={DOCUMENT_ID}>
        {({ isLoaded, isError, documentState }) => {
          if (isError) return <Status text="This PDF could not be opened." />;
          if (!isLoaded || !documentState.document) return <Status text="Opening the PDF…" />;
          return (
            <OnMount callback={() => setOpened(true)}>
              <Viewer document={documentState.document} />
            </OnMount>
          );
        }}
      </DocumentContent>
    </EmbedPDF>
  );
}

function OnMount({ callback, children }: { callback: () => void; children: React.ReactNode }): React.ReactNode {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(callback, []);
  return children;
}

export function Status({ text }: { text: string }): React.JSX.Element {
  return <div className="status" role="status">{text}</div>;
}
