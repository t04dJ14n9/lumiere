/** EmbedPDF default tool ids exposed in Annotate mode (spec v1 toolkit). */
export const ANNOTATION_TOOL_IDS = [
  "highlight",
  "underline",
  "strikeout",
  "squiggly",
  "textComment",
  "freeText",
  "ink",
  "square",
  "circle",
  "line",
  "lineArrow",
  "polygon",
  "polyline",
  "stamp",
] as const;

export type AnnotationToolId = (typeof ANNOTATION_TOOL_IDS)[number];

export const DEFAULT_ANNOTATION_TOOL: AnnotationToolId = "highlight";

export const ANNOTATION_TOOL_LABELS: Record<AnnotationToolId, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "Strikeout",
  squiggly: "Squiggly",
  textComment: "Note",
  freeText: "Free text",
  ink: "Ink",
  square: "Rectangle",
  circle: "Ellipse",
  line: "Line",
  lineArrow: "Arrow",
  polygon: "Polygon",
  polyline: "Polyline",
  stamp: "Stamp",
};

export const ANNOTATION_TOOL_ICONS: Record<AnnotationToolId, string> = {
  highlight: "paintcan",
  underline: "whole-word",
  strikeout: "strike",
  squiggly: "wand",
  textComment: "comment",
  freeText: "text-size",
  ink: "edit",
  square: "symbol-ruler",
  circle: "circle-outline",
  line: "remove",
  lineArrow: "arrow-right",
  polygon: "triangle-down",
  polyline: "type-hierarchy-sub",
  stamp: "rocket",
};

export const ANNOTATION_COLOR_PRESETS = [
  "#FFE600",
  "#FF6B6B",
  "#4DABF7",
  "#51CF66",
  "#CC5DE8",
  "#212529",
] as const;

export function isAnnotationToolId(value: unknown): value is AnnotationToolId {
  return (
    typeof value === "string" &&
    (ANNOTATION_TOOL_IDS as readonly string[]).includes(value)
  );
}
