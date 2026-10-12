import { EditorSelection } from "@codemirror/state";
import type { Extension, SelectionRange } from "@codemirror/state";
import { BlockType, RectangleMarker, layer } from "@codemirror/view";
import type { BlockInfo, EditorView, ViewUpdate } from "@codemirror/view";

/**
 * The selection drawn as Obsidian's native selection looks: on each line it
 * hugs the text, then a short stub (about a space) stands for the line break
 * it includes; an empty line gets a thin stub. There is no full-width band,
 * and a code block's background shows untinted around its code. Rendered
 * block widgets inside the selection are tinted whole.
 *
 * CodeMirror's own selection layer (drawSelection) stays for its hidden
 * native-selection handling, and is hidden in base.css.
 */
const CLASS = "cm-selectionBackground";
/** An empty line's stub, as measured in Obsidian 1.14.4. */
const EMPTY_STUB = 4;

function base(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft,
    top: rect.top - view.scrollDOM.scrollTop,
  };
}

function breakStub(view: EditorView): number {
  return Math.max(EMPTY_STUB, Math.round(view.defaultCharacterWidth * 0.5));
}

function blockMarkers(
  view: EditorView,
  range: SelectionRange,
  block: BlockInfo,
  origin: { left: number; top: number },
): RectangleMarker[] {
  const content = view.contentDOM.getBoundingClientRect();
  if (block.type !== BlockType.Text) {
    // A rendered block (table, HTML, math, embed) inside the selection.
    if (range.from > block.from || range.to < block.to) {
      return [];
    }
    return [
      new RectangleMarker(
        CLASS,
        content.left - origin.left,
        block.top + view.documentTop - origin.top,
        content.width,
        block.height,
      ),
    ];
  }
  const markers: RectangleMarker[] = [];
  const from = Math.max(range.from, block.from);
  const to = Math.min(range.to, block.to);
  if (to > from) {
    markers.push(
      ...RectangleMarker.forRange(view, CLASS, EditorSelection.range(from, to)),
    );
  }
  if (range.to > block.to && range.from <= block.to) {
    const end = view.coordsAtPos(block.to, -1) ?? view.coordsAtPos(block.to, 1);
    if (end) {
      markers.push(
        new RectangleMarker(
          CLASS,
          end.left - origin.left,
          end.top - origin.top,
          block.length === 0 ? EMPTY_STUB : breakStub(view),
          end.bottom - end.top,
        ),
      );
    }
  }
  return markers;
}

function markers(view: EditorView): RectangleMarker[] {
  const origin = base(view);
  const out: RectangleMarker[] = [];
  for (const range of view.state.selection.ranges) {
    if (range.empty) {
      continue;
    }
    for (const block of view.viewportLineBlocks) {
      if (block.to < range.from || block.from > range.to) {
        continue;
      }
      const parts = Array.isArray(block.type) ? block.type : [block];
      for (const part of parts) {
        if (part.to < range.from || part.from > range.to) {
          continue;
        }
        out.push(...blockMarkers(view, range, part, origin));
      }
    }
  }
  return out;
}

export const selectionLayer: Extension = layer({
  above: false,
  class: "mw-selection-layer",
  markers,
  update: (update: ViewUpdate) =>
    update.docChanged ||
    update.selectionSet ||
    update.viewportChanged ||
    update.geometryChanged,
});
