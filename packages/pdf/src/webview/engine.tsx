import { EmbedPDF } from "@embedpdf/core/react";
import { DocumentContent } from "@embedpdf/plugin-document-manager/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ViewerEngine } from "./browser-render-environment";
import { postToHost } from "./host";
import { DOCUMENT_ID, viewerPlugins } from "./plugins";
import {
  RenderSessionDisposedError,
  type EngineMode,
  type PdfRenderSession,
} from "./render-session";
import { Viewer } from "./viewer";

/** A worker that has not opened the PDF within this time is given up. */
const WORKER_TIMEOUT_MS = 15_000;

/**
 * Start PDFium and show the session's PDF.
 *
 * PDFium normally runs in a web worker so rendering never blocks scrolling.
 * If the worker cannot start (a blocked blob URL, a failed WASM fetch, a
 * crash, or silence), the engine restarts on the main thread instead. The
 * engines belong to the session (render-session.ts), which main.tsx disposes
 * when the next PDF arrives; this component only asks for them.
 */
export function PdfEngine({
  session,
}: {
  session: PdfRenderSession<ViewerEngine>;
}): React.JSX.Element {
  const [mode, setMode] = useState<EngineMode>("worker");
  const useMainThread = useCallback(() => {
    void session.release("worker"); // never rejects; the main-thread engine waits for it
    setMode("main-thread");
  }, [session]);
  return (
    <EngineSession
      key={mode}
      session={session}
      mode={mode}
      onWorkerFailure={useMainThread}
    />
  );
}

/** The session's engine for `mode`, or the error that kept it from starting. */
function useSessionEngine(
  session: PdfRenderSession<ViewerEngine>,
  mode: EngineMode,
): { engine?: ViewerEngine; error?: unknown } {
  const [state, setState] = useState<{
    engine?: ViewerEngine;
    error?: unknown;
  }>({});
  useEffect(() => {
    let active = true;
    session.engine(mode).then(
      (engine) => {
        performance.mark("pdf:engine");
        if (active) {
          setState({ engine });
        }
      },
      (error: unknown) => {
        if (active && !(error instanceof RenderSessionDisposedError)) {
          setState({ error });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [session, mode]);
  return state;
}

function EngineSession({
  session,
  mode,
  onWorkerFailure,
}: {
  session: PdfRenderSession<ViewerEngine>;
  mode: EngineMode;
  onWorkerFailure: () => void;
}): React.JSX.Element {
  const worker = mode === "worker";
  const { engine, error } = useSessionEngine(session, mode);
  const plugins = useMemo(() => viewerPlugins(session.buffer), [session]);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!error) {
      return;
    }
    if (worker) {
      console.warn(
        "The PDF engine could not start in a worker; using the main thread.",
        error,
      );
      onWorkerFailure();
    } else {
      postToHost({
        type: "error",
        message: `The PDF engine failed: ${String(error)}`,
      });
    }
  }, [error, onWorkerFailure, worker]);

  // Treat a worker that never answers like one that failed.
  useEffect(() => {
    if (!worker || opened) {
      return;
    }
    const timer = window.setTimeout(onWorkerFailure, WORKER_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [onWorkerFailure, opened, worker]);

  if (!engine) {
    return <Status text="Starting the PDF engine…" />;
  }
  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      <DocumentContent documentId={DOCUMENT_ID}>
        {({ isLoaded, isError, documentState }) => {
          if (isError) {
            return <Status text="This PDF could not be opened." />;
          }
          if (!isLoaded || !documentState.document) {
            return <Status text="Opening the PDF…" />;
          }
          return (
            <OnMount
              callback={() => {
                performance.mark("pdf:opened");
                setOpened(true);
              }}
            >
              <Viewer document={documentState.document} />
            </OnMount>
          );
        }}
      </DocumentContent>
    </EmbedPDF>
  );
}

function OnMount({
  callback,
  children,
}: {
  callback: () => void;
  children: React.ReactNode;
}): React.ReactNode {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  useEffect(callback, []);
  return children;
}

export function Status({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="status" role="status">
      {text}
    </div>
  );
}
