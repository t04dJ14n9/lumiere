import * as vscode from "vscode";
import {
  ANNOTATION_TOOL_ICONS,
  ANNOTATION_TOOL_IDS,
  ANNOTATION_TOOL_LABELS,
  DEFAULT_ANNOTATION_TOOL,
  type AnnotationToolId,
} from "../../../shared/annotation-tools";
import type { PdfPanels } from "../pdf/panels";

type ToolItem = vscode.QuickPickItem & { tool: AnnotationToolId };

/** Enter Annotate mode, or leave it when already annotating. */
export function toggleAnnotate(panels: PdfPanels): void {
  const panel = panels.active;
  if (!panel?.view) {
    return;
  }
  if (panel.view.tool === "annotate") {
    panel.act({ action: "setTool", tool: "text" });
  } else {
    panel.act({ action: "setTool", tool: "annotate" });
  }
}

/** Pick an EmbedPDF annotation tool; enters Annotate mode if needed. */
export async function pickAnnotationTool(panels: PdfPanels): Promise<void> {
  const panel = panels.active;
  if (!panel?.view) {
    return;
  }
  if (panel.view.tool !== "annotate") {
    panel.act({ action: "setTool", tool: "annotate" });
  }
  const current = panel.view.annotationTool ?? DEFAULT_ANNOTATION_TOOL;
  const items: ToolItem[] = ANNOTATION_TOOL_IDS.map((id) => {
    const item: ToolItem = {
      label: `$(${ANNOTATION_TOOL_ICONS[id]}) ${ANNOTATION_TOOL_LABELS[id]}`,
      tool: id,
    };
    if (id === current) {
      item.description = "current";
    }
    return item;
  });
  const choice = await vscode.window.showQuickPick(items, {
    title: "PDF Annotation Tool",
    placeHolder: "Highlight, underline, ink, shape, note, stamp…",
  });
  if (choice && panels.active === panel) {
    panel.act({ action: "setAnnotationTool", tool: choice.tool });
  }
}
