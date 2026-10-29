import {
  findClusterBreak,
  type SelectionRange,
  type Text,
} from "@codemirror/state";
import { BlockType, Direction, type EditorView } from "@codemirror/view";
import type { CaretAppearance, CaretMode } from "./caret";
import { caretCharacterPosition } from "./caret";

export interface CaretGeometry {
  /** `end` is the one-pixel caret at the active end of a Vim visual selection. */
  part: "main" | "end";
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  font: Record<string, string>;
}

function characterFont(view: EditorView, head: number): Record<string, string> {
  const { node } = view.domAtPos(head);
  const element =
    node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  const style = view.dom.ownerDocument.defaultView?.getComputedStyle(
    element ?? view.contentDOM,
  );
  if (!style) {
    return {};
  }
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    fontStretch: style.fontStretch,
    fontFeatureSettings: style.fontFeatureSettings,
    fontVariationSettings: style.fontVariationSettings,
    letterSpacing: style.letterSpacing,
  };
}

/** Screen pixels of leading above (and below) a character's glyph box in its line. */
function halfLeading(view: EditorView, head: number, glyphHeight: number) {
  const { node } = view.domAtPos(head);
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const line = element?.closest(".cm-line");
  const style = line
    ? view.dom.ownerDocument.defaultView?.getComputedStyle(line)
    : undefined;
  const lineHeight = style ? parseFloat(style.lineHeight) * view.scaleY : NaN;
  return Number.isFinite(lineHeight) && lineHeight > glyphHeight
    ? (lineHeight - glyphHeight) / 2
    : 0;
}

/** The start of the grapheme cluster that contains `position`. */
function clusterStart(document: Text, position: number): number {
  const line = document.lineAt(position);
  const offset = position - line.from;
  if (offset >= line.length) {
    return position;
  }
  const end = findClusterBreak(line.text, offset, true);
  return line.from + findClusterBreak(line.text, end, false);
}

/** Where a caret sits relative to its line, in screen pixels. */
interface Placement {
  left: number;
  width: number;
}

/**
 * The built-in editor places every caret on whole pixels counted from the start
 * of the line's text, a block as wide as the rounded character (9.64 px
 * becomes 10), a line two or more pixels wide one pixel to the left of the
 * character's edge (it straddles the boundary) unless the character starts
 * the line. Measured in VS Code 1.141 (docs/vim-caret.md).
 */
function snapToPixels(
  view: EditorView,
  line: { from: number },
  caret: { left: number; width: number; straddles: boolean },
): Placement {
  const lineStart = view.coordsAtPos(line.from, 1)?.left;
  if (view.textDirection !== Direction.LTR || lineStart === undefined) {
    return { left: caret.left, width: caret.width };
  }
  const offset = Math.round((caret.left - lineStart) / view.scaleX);
  const shift = caret.straddles && caret.width >= 2 && offset >= 1 ? 1 : 0;
  return {
    left: lineStart + (offset - shift) * view.scaleX,
    width: Number.isInteger(caret.width)
      ? caret.width
      : Math.max(1, Math.round(caret.width)),
  };
}

/** Scroller-relative CSS pixels, including zoom and scroll. */
interface Frame {
  baseLeft: number;
  baseTop: number;
}

const toScroller = (view: EditorView, frame: Frame, left: number) =>
  (left - frame.baseLeft) / view.scaleX + view.scrollDOM.scrollLeft;

/** What every caret of one measurement shares. */
interface Measure {
  view: EditorView;
  appearance: CaretAppearance;
  mode: CaretMode;
  frame: Frame;
}

/** The caret at a range's active character, with the full height of its line box. */
interface MainCaret {
  geometry: CaretGeometry;
  fullHeight: number;
}

/** The caret (block, line, underline) at the range's active character. */
function mainCaret(
  { view, appearance, frame }: Measure,
  head: number,
  position: { left: number; top: number; bottom: number },
  character: { left: number; right: number } | null,
): MainCaret {
  const line = view.state.doc.lineAt(head);
  const offset = head - line.from;
  const text = line.text.slice(
    offset,
    findClusterBreak(line.text, offset, true),
  );
  const characterWidth = character
    ? (character.right - character.left) / view.scaleX
    : view.defaultCharacterWidth;
  const snapped = snapToPixels(view, line, {
    left: position.left,
    width: appearance.width === "character" ? characterWidth : appearance.width,
    straddles: appearance.style === "line",
  });
  // The built-in editor's caret fills the whole line box; CodeMirror's
  // character rectangle is only the glyph box, so add the line's half-leading.
  const leading = halfLeading(view, head, position.bottom - position.top);
  const fullHeight =
    (position.bottom - position.top + 2 * leading) / view.scaleY;
  const height =
    appearance.height === "character" ? fullHeight : appearance.height;
  const filled =
    (appearance.style === "block" || appearance.style === "half-block") &&
    character &&
    text !== "\t";
  const geometry: CaretGeometry = {
    part: "main",
    left: toScroller(view, frame, snapped.left),
    top:
      (position.top - leading - frame.baseTop) / view.scaleY +
      view.scrollDOM.scrollTop +
      fullHeight -
      height,
    // An empty line in Vim's visual mode shows only the block's two border pixels.
    width: appearance.endCaret && text === "" ? 2 : snapped.width,
    height,
    text: filled ? text : "",
    font: characterFont(view, head),
  };
  return { geometry, fullHeight };
}

/**
 * Vim's visual selection includes its active character, so the native caret
 * sits at the selection's end: after that character, but never past the end of
 * its line (linewise selections run on to the next).
 */
function endCaret(
  { view, frame }: Measure,
  range: SelectionRange,
  head: number,
  main: MainCaret,
): CaretGeometry | undefined {
  const line = view.state.doc.lineAt(head);
  const end = view.coordsAtPos(Math.min(range.head, line.to), -1);
  if (!end) {
    return undefined;
  }
  const placed = snapToPixels(view, line, {
    left: end.left,
    width: 1,
    straddles: false,
  });
  return {
    part: "end",
    left: toScroller(view, frame, placed.left),
    top: main.geometry.top - (main.fullHeight - main.geometry.height),
    width: 1,
    height: main.fullHeight,
    text: "",
    font: {},
  };
}

function caretOutsideViewport(view: EditorView): boolean {
  const { from, to } = view.viewport;
  if (to <= from) {
    return false;
  }
  return view.state.selection.ranges.every(
    (range) => range.head < from || range.head > to,
  );
}

/** A block widget has no text caret box. Measuring it reads the whole widget. */
function isReplacedCaretBlock(view: EditorView, head: number): boolean {
  const type = view.lineBlockAt(head).type;
  if (Array.isArray(type)) {
    return type.every((part) => part.type !== BlockType.Text);
  }
  return type !== BlockType.Text;
}

function skipCaretLayout(view: EditorView): boolean {
  if (caretOutsideViewport(view)) {
    return true;
  }
  // The cell editor draws its own caret. The outer editor is blurred, and
  // coordsAtPos on the table widget is the whole grid.
  if (view.hasFocus) {
    return false;
  }
  return view.state.selection.ranges.every((range) =>
    isReplacedCaretBlock(view, range.head),
  );
}

function measureRange(
  measure: Measure,
  range: SelectionRange,
): CaretGeometry[] {
  const { view, appearance, mode } = measure;
  // Heads outside the drawn range have no on-screen caret. coordsAtPos would
  // force layout for a caret the viewport cannot show.
  if (
    view.viewport.to > view.viewport.from &&
    (range.head < view.viewport.from || range.head > view.viewport.to)
  ) {
    return [];
  }
  if (!view.hasFocus && isReplacedCaretBlock(view, range.head)) {
    return [];
  }
  const placed = caretCharacterPosition(view.state.doc, range, mode);
  // Vim moves by code point, so its head can sit inside a cluster (after the
  // `e` of `é` written with a combining mark); a block covers the whole cluster.
  const head =
    appearance.width === "character"
      ? clusterStart(view.state.doc, placed)
      : placed;
  const character = view.coordsForChar(head);
  // At a soft wrap, a block belongs to the character's row even when the
  // selection's association points at the preceding row.
  const position =
    appearance.width === "character" && character
      ? character
      : view.coordsAtPos(head, range.assoc || 1);
  if (!position) {
    return [];
  }
  const main = mainCaret(measure, head, position, character);
  const end = appearance.endCaret
    ? endCaret(measure, range, head, main)
    : undefined;
  return end ? [main.geometry, end] : [main.geometry];
}

/** Screen coordinates become scroller-relative CSS pixels, including zoom/scroll. */
export function measureCarets(
  view: EditorView,
  appearance: CaretAppearance,
  mode: CaretMode,
): CaretGeometry[] {
  if (skipCaretLayout(view)) {
    return [];
  }
  const base = view.scrollDOM.getBoundingClientRect();
  const frame = {
    baseLeft:
      view.textDirection === Direction.LTR
        ? base.left
        : base.right - view.scrollDOM.clientWidth,
    baseTop: base.top,
  };
  const measure = { view, appearance, mode, frame };
  return view.state.selection.ranges.flatMap((range) =>
    measureRange(measure, range),
  );
}
