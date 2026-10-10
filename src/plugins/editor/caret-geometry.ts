import { findClusterBreak, type Text } from "@codemirror/state";
import { Direction, type EditorView } from "@codemirror/view";
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

/**
 * The built-in editor places every caret on whole pixels counted from the start
 * of the line's text, a block as wide as the rounded character (9.64 px
 * becomes 10), a line two or more pixels wide half a pixel to the left of the
 * character's edge (it straddles the boundary) unless the character starts
 * the line. Measured in VS Code 1.141 (docs/vim-caret.md).
 */
function snapToPixels(
  view: EditorView,
  position: { left: number },
  width: number,
  line: { from: number },
): { left: number; width: number } {
  const lineStart = view.coordsAtPos(line.from, 1)?.left;
  if (view.textDirection !== Direction.LTR || lineStart === undefined) {
    return { left: position.left, width };
  }
  const offset = Math.round((position.left - lineStart) / view.scaleX);
  const shift = width >= 2 && offset >= 1 ? 1 : 0;
  return {
    left: lineStart + (offset - shift) * view.scaleX,
    width: Number.isInteger(width) ? width : Math.max(1, Math.round(width)),
  };
}

/** Screen coordinates become scroller-relative CSS pixels, including zoom/scroll. */
export function measureCarets(
  view: EditorView,
  appearance: CaretAppearance,
  mode: CaretMode,
): CaretGeometry[] {
  const base = view.scrollDOM.getBoundingClientRect();
  const baseLeft =
    view.textDirection === Direction.LTR
      ? base.left
      : base.right - view.scrollDOM.clientWidth;
  const geometries: CaretGeometry[] = [];
  for (const range of view.state.selection.ranges) {
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
      continue;
    }
    const line = view.state.doc.lineAt(head);
    const offset = head - line.from;
    const text = line.text.slice(
      offset,
      findClusterBreak(line.text, offset, true),
    );
    const characterWidth = character
      ? (character.right - character.left) / view.scaleX
      : view.defaultCharacterWidth;
    const requested =
      appearance.width === "character" ? characterWidth : appearance.width;
    const snapped = snapToPixels(view, position, requested, line);
    const width = snapped.width;
    // The built-in editor's caret fills the whole line box; CodeMirror's
    // character rectangle is only the glyph box, so add the line's half-leading.
    const leading = halfLeading(view, head, position.bottom - position.top);
    const fullHeight =
      (position.bottom - position.top + 2 * leading) / view.scaleY;
    const height =
      appearance.height === "character" ? fullHeight : appearance.height;
    const top =
      (position.top - leading - base.top) / view.scaleY +
      view.scrollDOM.scrollTop +
      fullHeight -
      height;
    geometries.push({
      part: "main",
      left: (snapped.left - baseLeft) / view.scaleX + view.scrollDOM.scrollLeft,
      top,
      width,
      height,
      text:
        (appearance.style === "block" || appearance.style === "half-block") &&
        character &&
        text !== "\t"
          ? text
          : "",
      font: characterFont(view, head),
    });
    if (appearance.endCaret) {
      // Vim's visual selection includes its active character, so the native
      // caret sits at the selection's end: after that character, but never
      // past the end of its line (linewise selections run on to the next).
      const endPosition = Math.min(range.head, line.to);
      const end = view.coordsAtPos(endPosition, -1);
      if (end) {
        const placedEnd = snapToPixels(view, end, 1, line);
        geometries.push({
          part: "end",
          left:
            (placedEnd.left - baseLeft) / view.scaleX +
            view.scrollDOM.scrollLeft,
          top,
          width: 1,
          height: fullHeight,
          text: "",
          font: {},
        });
      }
    }
  }
  return geometries;
}
