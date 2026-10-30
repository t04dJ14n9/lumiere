import React from "react";
import {
  ANNOTATION_COLOR_PRESETS,
  ANNOTATION_TOOL_ICONS,
  ANNOTATION_TOOL_IDS,
  ANNOTATION_TOOL_LABELS,
  type AnnotationToolId,
} from "../shared/annotation-tools";
import type { ViewerAction } from "../shared/view-state";

export function AnnotationToolkit({
  annotationTool,
  canUndo,
  canRedo,
  run,
  onColor,
}: {
  annotationTool: AnnotationToolId | null;
  canUndo: boolean;
  canRedo: boolean;
  run: (action: ViewerAction) => void;
  onColor: (color: string) => void;
}): React.JSX.Element {
  return (
    <span
      className="toolbar-group annotation-toolkit"
      role="group"
      aria-label="PDF annotation tools"
    >
      <button
        type="button"
        className="icon-button"
        aria-label="Undo annotation"
        title="Undo annotation"
        disabled={!canUndo}
        onClick={() => run({ action: "annotationUndo" })}
      >
        <i className="codicon codicon-discard" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Redo annotation"
        title="Redo annotation"
        disabled={!canRedo}
        onClick={() => run({ action: "annotationRedo" })}
      >
        <i className="codicon codicon-redo" aria-hidden="true" />
      </button>
      <span className="separator" />
      {ANNOTATION_TOOL_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={`icon-button${annotationTool === id ? " pressed" : ""}`}
          aria-label={ANNOTATION_TOOL_LABELS[id]}
          title={ANNOTATION_TOOL_LABELS[id]}
          aria-pressed={annotationTool === id}
          onClick={() => run({ action: "setAnnotationTool", tool: id })}
        >
          <i
            className={`codicon codicon-${ANNOTATION_TOOL_ICONS[id]}`}
            aria-hidden="true"
          />
        </button>
      ))}
      <span className="separator" />
      {ANNOTATION_COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          className="color-chip"
          aria-label={`Annotation color ${color}`}
          title={color}
          style={{ background: color }}
          onClick={() => onColor(color)}
        />
      ))}
    </span>
  );
}
