import { findClusterBreak, type Text } from "@codemirror/state";
import { Direction, type EditorView } from "@codemirror/view";
import type { CaretAppearance, CaretMode } from "./caret";
import { caretCharacterPosition } from "./caret";

export interface CaretGeometry {
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
    const width =
      appearance.width === "character" ? characterWidth : appearance.width;
    // The built-in editor's caret fills the whole line box; CodeMirror's
    // character rectangle is only the glyph box, so add the line's half-leading.
    const leading = halfLeading(view, head, position.bottom - position.top);
    const fullHeight =
      (position.bottom - position.top + 2 * leading) / view.scaleY;
    const height =
      appearance.height === "character" ? fullHeight : appearance.height;
    geometries.push({
      left:
        (position.left - baseLeft) / view.scaleX + view.scrollDOM.scrollLeft,
      top:
        (position.top - leading - base.top) / view.scaleY +
        view.scrollDOM.scrollTop +
        fullHeight -
        height,
      width,
      height,
      text:
        appearance.style === "block" && character && text !== "\t" ? text : "",
      font: characterFont(view, head),
    });
  }
  return geometries;
}
