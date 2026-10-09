import { findClusterBreak } from "@codemirror/state";
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
    const head = caretCharacterPosition(view.state.doc, range, mode);
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
    const fullHeight = (position.bottom - position.top) / view.scaleY;
    const height =
      appearance.height === "character" ? fullHeight : appearance.height;
    geometries.push({
      left:
        (position.left - baseLeft) / view.scaleX + view.scrollDOM.scrollLeft,
      top:
        (position.top - base.top) / view.scaleY +
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
