import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useHistoryCapability } from "@embedpdf/plugin-history/react";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ANNOTATION_TOOL,
  type AnnotationToolId,
  isAnnotationToolId,
} from "../shared/annotation-tools";

const HISTORY_TOPIC = "annotations";

/** Active EmbedPDF annotation tool + History undo/redo for one document. */
export function useAnnotationMode(documentId: string): {
  annotationTool: AnnotationToolId | null;
  setAnnotationTool: (tool: AnnotationToolId | null) => void;
  setColor: (color: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
} {
  const { provides: annots } = useAnnotationCapability();
  const { provides: history } = useHistoryCapability();
  const [annotationTool, setAnnotationToolState] =
    useState<AnnotationToolId | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!annots) return;
    return annots.onActiveToolChange(({ documentId: id, tool }) => {
      if (id !== documentId) return;
      const next = tool?.id;
      setAnnotationToolState(isAnnotationToolId(next) ? next : null);
    });
  }, [annots, documentId]);

  useEffect(() => {
    if (!history) return;
    const scope = history.forDocument(documentId);
    const refresh = (): void => {
      setCanUndo(scope.canUndo(HISTORY_TOPIC) || scope.canUndo());
      setCanRedo(scope.canRedo(HISTORY_TOPIC) || scope.canRedo());
    };
    refresh();
    return scope.onHistoryChange(() => refresh());
  }, [history, documentId]);

  const setAnnotationTool = useCallback(
    (tool: AnnotationToolId | null) => {
      annots?.forDocument(documentId).setActiveTool(tool);
      setAnnotationToolState(tool);
    },
    [annots, documentId],
  );

  const setColor = useCallback(
    (color: string) => {
      const id = annotationTool ?? DEFAULT_ANNOTATION_TOOL;
      annots?.setToolDefaults(id, {
        strokeColor: color,
        color,
        opacity: 0.5,
      } as never);
    },
    [annots, annotationTool],
  );

  const undo = useCallback(() => {
    history?.forDocument(documentId).undo(HISTORY_TOPIC);
  }, [history, documentId]);

  const redo = useCallback(() => {
    history?.forDocument(documentId).redo(HISTORY_TOPIC);
  }, [history, documentId]);

  return {
    annotationTool,
    setAnnotationTool,
    setColor,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
