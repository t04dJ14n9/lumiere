import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useRegistry } from "@embedpdf/core/react";
import { useEffect, useRef } from "react";
import type { PdfDocumentObject } from "@embedpdf/models";
import {
  acceptAnnotationSave,
  annotationLoadState,
} from "./annotation-load-state";
import { postToHost } from "./host";

/**
 * On each committed annotation mutation, saveAsCopy and ask the host to
 * overwrite the open file. Serializes overlapping saves.
 */
export function useAnnotationSaveSession(document: PdfDocumentObject): {
  retry: () => void;
} {
  const { provides: annots } = useAnnotationCapability();
  const { registry } = useRegistry();
  const chain = useRef(Promise.resolve());
  const documentRef = useRef(document);
  documentRef.current = document;

  const enqueueSave = (): void => {
    chain.current = chain.current.then(async () => {
      const state = annotationLoadState();
      const engine = registry?.getEngine();
      const doc = documentRef.current;
      if (!engine || !doc || !state) {
        return;
      }
      const { load, sha256: baseSha256 } = state;
      try {
        const data = await engine.saveAsCopy(doc).toPromise();
        postToHost({ type: "annotationSave", load, baseSha256, data });
      } catch (error) {
        postToHost({
          type: "annotationSaveFailed",
          load,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  };

  useEffect(() => {
    if (!annots) return;
    return annots.onAnnotationEvent((event) => {
      if (
        event.type === "loaded" ||
        event.documentId !== document.id ||
        !event.committed
      ) {
        return;
      }
      enqueueSave();
    });
  }, [annots, document.id, registry]);

  return { retry: enqueueSave };
}

/** Apply host annotation save replies to the remembered base hash. */
export function applyAnnotationHostMessage(message: {
  type: string;
  ok?: boolean;
  sha256?: string;
}): void {
  if (
    message.type === "annotationSaveResult" &&
    message.ok === true &&
    typeof message.sha256 === "string"
  ) {
    acceptAnnotationSave(message.sha256);
  }
}
