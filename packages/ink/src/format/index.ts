/**
 * The sketch file format, and the outlines that draw it: pure code, with no
 * DOM, Node or host APIs, so it runs in every host, in a worker and in
 * tests.
 */
export * from "./types";
export {
  FORMAT_NAME,
  FORMAT_VERSION,
  POINT_FIELDS,
  checkedPencilKit,
  decodeSketch,
  encodeSketch,
  strokesFingerprint,
  withPencilKit,
} from "./encoding";
export { SketchFormatError, isColor, readSketchFields } from "./validation";
export {
  outlinePathData,
  strokeOutline,
  strokePathData,
  strokePieces,
  type OutlinePiece,
  type OutlinePoint,
  type Vec,
} from "./outline";
export {
  PAPER_DOT,
  PAPER_LINE,
  paperMarks,
  paperMarksWithin,
  paperSvg,
  type PaperArea,
  type PaperMarks,
} from "./paper";
export {
  SKETCH_EXTENSION,
  SKETCH_NAMESPACE,
  isSketchPath,
  sketchFromSvg,
  sketchToSvg,
  strokeFills,
  strokeSvg,
  type FillPiece,
  type StrokeFills,
} from "./svg";
