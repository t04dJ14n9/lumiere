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
 * native-selection handling, and is hidden in base.css. Its hide-native
 * pieces are not exported separately, so its (cheap, measure-phase) marker
 * pass still runs; this layer reads the shared geometry once per update.
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

interface Geometry {
  origin: { left: number; top: number };
  content: DOMRect;
}

/**
 * The text from `from` to `to` (inside one text block), one rectangle per
 * contiguous run on each visual row. Rows are the block's wrapped rows, so a
 * wrapped line is tinted only on its text, row by row; runs that the browser
 * lays out apart (bidirectional text) stay apart.
 */
function textMarkers(
  view: EditorView,
  block: BlockInfo,
  span: { from: number; to: number },
  { origin }: Geometry,
): RectangleMarker[] {
  const { from, to } = span;
  const start = view.domAtPos(from);
  const end = view.domAtPos(to);
  const range = document.createRange();
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } catch {
    return [];
  }
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
  if (rects.length === 0) {
    return [];
  }
  const top = block.top + view.documentTop;
  const pitch = rowPitch(view, block);
  const rows = new Map<number, { left: number; right: number }[]>();
  for (const rect of rects) {
    const row = Math.max(
      0,
      Math.floor(((rect.top + rect.bottom) / 2 - top) / pitch),
    );
    const list = rows.get(row) ?? [];
    list.push({ left: rect.left, right: rect.right });
    rows.set(row, list);
  }
  const out: RectangleMarker[] = [];
  for (const [row, list] of rows) {
    list.sort((a, b) => a.left - b.left);
    const runs: { left: number; right: number }[] = [];
    for (const rect of list) {
      const last = runs[runs.length - 1];
      if (last && rect.left <= last.right + 1) {
        last.right = Math.max(last.right, rect.right);
      } else {
        runs.push({ ...rect });
      }
    }
    for (const run of runs) {
      out.push(
        new RectangleMarker(
          CLASS,
          run.left - origin.left,
          top + row * pitch - origin.top,
          run.right - run.left,
          pitch,
        ),
      );
    }
  }
  return out;
}

/** The height of one visual row of a text block. */
function rowPitch(view: EditorView, block: BlockInfo): number {
  const first = view.coordsAtPos(block.from, 1);
  const last = view.coordsAtPos(block.to, -1);
  if (!first || !last) {
    return block.height;
  }
  const height = first.bottom - first.top;
  const rows = Math.max(1, Math.round((last.top - first.top) / height) + 1);
  return block.height / rows;
}

function blockMarkers(
  view: EditorView,
  range: SelectionRange,
  block: BlockInfo,
  geometry: Geometry,
): RectangleMarker[] {
  const { origin, content } = geometry;
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
    markers.push(...textMarkers(view, block, { from, to }, geometry));
  }
  if (range.to > block.to && range.from <= block.to) {
    const end = view.coordsAtPos(block.to, -1) ?? view.coordsAtPos(block.to, 1);
    if (end) {
      const top = block.top + view.documentTop;
      const pitch = rowPitch(view, block);
      const row = Math.max(
        0,
        Math.floor(((end.top + end.bottom) / 2 - top) / pitch),
      );
      markers.push(
        new RectangleMarker(
          CLASS,
          end.left - origin.left,
          top + row * pitch - origin.top,
          block.length === 0 ? EMPTY_STUB : breakStub(view),
          pitch,
        ),
      );
    }
  }
  return markers;
}

function markers(view: EditorView): RectangleMarker[] {
  const geometry: Geometry = {
    origin: base(view),
    content: view.contentDOM.getBoundingClientRect(),
  };
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
        out.push(...blockMarkers(view, range, part, geometry));
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
