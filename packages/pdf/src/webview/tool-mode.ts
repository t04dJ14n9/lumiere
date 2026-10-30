import {
  useInteractionManager,
  useInteractionManagerCapability,
} from "@embedpdf/plugin-interaction-manager/react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_ANNOTATION_TOOL } from "../shared/annotation-tools";
import type { ToolMode } from "../shared/view-state";
import { touchOnly } from "./touch";

/**
 * EmbedPDF's interaction mode for the Select Region tool: drags draw a
 * region anywhere on a page, over text too. The default mode ("text" here)
 * selects text, and a region only when the drag starts on empty space.
 */
const REGION_MODE = "lumiere.pdf.selectRegion";

/** The current tool and a way to change it. */
export function useToolMode(documentId: string): {
  tool: ToolMode;
  setTool: (tool: ToolMode) => void;
} {
  const { provides: interaction } = useInteractionManagerCapability();
  const { provides: selection } = useSelectionCapability();
  const { provides: annots } = useAnnotationCapability();
  const { state } = useInteractionManager(documentId);
  const [annotate, setAnnotate] = useState(false);

  useEffect(() => {
    registerToolModes(documentId, interaction, selection);
  }, [documentId, interaction, selection]);

  const setTool = useCallback(
    (tool: ToolMode): void => {
      const scope = interaction?.forDocument(documentId);
      if (!scope) {
        return;
      }
      if (tool === "annotate") {
        selection?.forDocument(documentId).clear();
        scope.activateDefaultMode();
        annots?.forDocument(documentId).setActiveTool(DEFAULT_ANNOTATION_TOOL);
        setAnnotate(true);
        return;
      }
      annots?.forDocument(documentId).setActiveTool(null);
      setAnnotate(false);
      if (tool === "region") {
        // A text selection would stay on screen, unreachable by region drags.
        selection?.forDocument(documentId).clear();
        scope.activate(REGION_MODE);
      } else {
        scope.activateDefaultMode();
      }
    },
    [documentId, interaction, selection, annots],
  );

  return {
    tool: resolveToolMode(annotate, state.activeMode),
    setTool,
  };
}

function resolveToolMode(annotate: boolean, activeMode: string): ToolMode {
  if (annotate) {
    return "annotate";
  }
  if (activeMode === REGION_MODE) {
    return "region";
  }
  return "text";
}

function registerToolModes(
  documentId: string,
  interaction: ReturnType<typeof useInteractionManagerCapability>["provides"],
  selection: ReturnType<typeof useSelectionCapability>["provides"],
): void {
  if (!interaction || !selection) {
    return;
  }
  if (touchOnly()) {
    // EmbedPDF's default mode takes every touch (touch-action: none) for
    // its drags; on a touch-only device it leaves them to the browser, so
    // a finger scrolls. Registering the mode again replaces it.
    interaction.registerMode({
      id: interaction.getDefaultMode(),
      scope: "page",
      exclusive: false,
      cursor: "auto",
      wantsRawTouch: false,
    });
  }
  interaction.registerMode({
    id: REGION_MODE,
    scope: "page",
    exclusive: false,
    cursor: "crosshair",
  });
  selection.enableForMode(
    REGION_MODE,
    { enableSelection: false, enableMarquee: true },
    documentId,
  );
}
