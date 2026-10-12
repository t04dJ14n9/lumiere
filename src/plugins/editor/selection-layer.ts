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
 * pieces are not exported separately, so its marker pass (measure phase,
 * not profiled) still runs; this layer reads the shared geometry once per
 * update.
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

interface Row {
  top: number;
  bottom: number;
  /** Horizontal extents of all the line's content on this row. */
  content: { left: number; right: number }[];
}

/** A Range over `from`..`to`, or null when the DOM can't express it. */
function domRange(view: EditorView, from: number, to: number): Range | null {
  const start = view.domAtPos(from);
  const end = view.domAtPos(to);
  const range = document.createRange();
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } catch {
    return null;
  }
  return range;
}

/** Marks a subtree that is not document text (a preview, tooltip, popover). */
export const SELECTION_IGNORE = "data-mw-selection-ignore";

/** Whether `element` lays out outside the line's text flow. */
function outOfFlow(element: Element, cache: Map<Element, boolean>): boolean {
  let known = cache.get(element);
  if (known === undefined) {
    const style = getComputedStyle(element);
    known =
      element.hasAttribute(SELECTION_IGNORE) ||
      element.getAttribute("role") === "tooltip" ||
      style.position === "absolute" ||
      style.position === "fixed" ||
      style.display === "none";
    cache.set(element, known);
  }
  return known;
}

/** Replaced or rendered inline content measured as one box, never inside. */
const ATOMIC_TAGS = new Set([
  "svg",
  "img",
  "canvas",
  "math",
  "video",
  "audio",
  "iframe",
  "object",
  "embed",
  "picture",
  "input",
  "button",
  "select",
  "textarea",
  "mjx-container",
]);

/**
 * Whether `element` is atomic inline content: a replaced element, a math
 * container (MathJax, KaTeX), or a widget (contenteditable=false). Its own
 * layout boxes stand for it; its internals (SVG paths, glyph groups, a
 * widget's parts) are drawing details, not document rows.
 */
function atomic(element: Element): boolean {
  return (
    ATOMIC_TAGS.has(element.localName) ||
    element.getAttribute("contenteditable") === "false" ||
    element.classList.contains("MathJax") ||
    element.classList.contains("katex")
  );
}

/**
 * Checks the range root and its ancestors up to the line: inside out-of-flow
 * content nothing counts (null); inside atomic content the outermost atom
 * stands for the range; otherwise undefined.
 */
function enclosingAtom(
  root: Node,
  cache: Map<Element, boolean>,
): Element | null | undefined {
  let atom: Element | undefined;
  for (
    let el: Element | null =
      root instanceof Element ? root : root.parentElement;
    el;
    el = el.parentElement
  ) {
    if (el.classList.contains("cm-line")) {
      break;
    }
    if (outOfFlow(el, cache)) {
      return null;
    }
    if (atomic(el)) {
      atom = el;
    }
  }
  return atom;
}

/**
 * The layout boxes of the document content in `range`: text nodes (clipped
 * to the range) and atomic inline content (one box per fragment of the
 * outer element), skipping any subtree that is out of flow (absolutely or
 * fixed positioned, hidden, a tooltip, or marked SELECTION_IGNORE). An open
 * footnote preview adds nothing; an inline formula adds its own box, not
 * its SVG's glyphs.
 */
function flowRects(range: Range): DOMRect[] {
  const root = range.commonAncestorContainer;
  const cache = new Map<Element, boolean>();
  const rects: DOMRect[] = [];
  const doc = root.ownerDocument ?? document;
  const enclosing = enclosingAtom(root, cache);
  if (enclosing !== undefined) {
    return enclosing ? [...enclosing.getClientRects()] : [];
  }
  const part = doc.createRange();
  const visit = (node: Node): void => {
    if (!range.intersectsNode(node)) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      part.setStart(
        node,
        node === range.startContainer ? range.startOffset : 0,
      );
      part.setEnd(
        node,
        node === range.endContainer ? range.endOffset : (node as Text).length,
      );
      rects.push(...part.getClientRects());
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }
    if (node !== root) {
      if (outOfFlow(node, cache)) {
        return;
      }
      if (atomic(node)) {
        rects.push(...node.getClientRects());
        return;
      }
    }
    if (!node.firstChild && node !== root) {
      rects.push(...node.getClientRects());
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(root);
  return rects;
}

/** The rendered .cm-line for a text block, if it is in the DOM. */
function lineElement(view: EditorView, block: BlockInfo): HTMLElement | null {
  let node: Node | null = view.domAtPos(block.from).node;
  while (node && node !== view.contentDOM) {
    if (node instanceof HTMLElement && node.classList.contains("cm-line")) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * The visual rows of a text block, measured from the browser's own layout:
 * the line's text boxes are grouped into rows by vertical overlap, and each
 * row's band runs from the midpoint of the gap above it to the midpoint of
 * the gap below (the block's edges for the first and last). Bands therefore
 * tile the line exactly whatever the font, size or line height, and a row
 * with a taller inline (a heading, a widget) gets its real height.
 */
function visualRows(view: EditorView, block: BlockInfo): Row[] {
  // The line's own box, not the height map: CodeMirror's block heights can
  // still be estimates when the layer measures, which stretched the last
  // band past the line.
  const box = lineElement(view, block)?.getBoundingClientRect();
  const top = box ? box.top : block.top + view.documentTop;
  const bottom = box ? box.bottom : top + block.height;
  const range = domRange(view, block.from, block.to);
  const boxes = range ? flowRects(range).filter((r) => r.height > 0) : [];
  const rows: { top: number; bottom: number }[] = [];
  for (const box of boxes.sort((a, b) => a.top - b.top)) {
    const mid = (box.top + box.bottom) / 2;
    const row = rows.find((row) => mid >= row.top && mid <= row.bottom);
    if (row) {
      row.top = Math.min(row.top, box.top);
      row.bottom = Math.max(row.bottom, box.bottom);
    } else {
      rows.push({ top: box.top, bottom: box.bottom });
    }
  }
  if (rows.length === 0) {
    return [{ top, bottom, content: [] }];
  }
  rows.sort((a, b) => a.top - b.top);
  const bands: Row[] = rows.map((row, i) => ({
    top: i === 0 ? top : (rows[i - 1]!.bottom + row.top) / 2,
    bottom:
      i === rows.length - 1 ? bottom : (row.bottom + rows[i + 1]!.top) / 2,
    content: [],
  }));
  for (const box of boxes) {
    if (box.width > 0) {
      rowOf(bands, box).content.push({ left: box.left, right: box.right });
    }
  }
  return bands;
}

/** The row whose band holds a box's vertical centre. */
function rowOf(rows: Row[], box: { top: number; bottom: number }): Row {
  const mid = (box.top + box.bottom) / 2;
  return (
    rows.find((row) => mid >= row.top && mid < row.bottom) ??
    (mid < rows[0]!.top ? rows[0]! : rows[rows.length - 1]!)
  );
}

/**
 * The text from `from` to `to` (inside one text block), one rectangle per
 * contiguous run on each visual row, as tall as that row. A wrapped line is
 * tinted only on its text, row by row; runs that the browser lays out apart
 * (bidirectional text) stay apart.
 */
function textMarkers(
  view: EditorView,
  rows: Row[],
  span: { from: number; to: number },
  { origin }: Geometry,
): RectangleMarker[] {
  const range = domRange(view, span.from, span.to);
  if (!range) {
    return [];
  }
  const runsByRow = new Map<Row, { left: number; right: number }[]>();
  for (const rect of flowRects(range)) {
    if (rect.width <= 0) {
      continue;
    }
    const row = rowOf(rows, rect);
    const list = runsByRow.get(row) ?? [];
    list.push({ left: rect.left, right: rect.right });
    runsByRow.set(row, list);
  }
  const out: RectangleMarker[] = [];
  for (const [row, list] of runsByRow) {
    list.sort((a, b) => a.left - b.left);
    const runs: { left: number; right: number }[] = [];
    for (const rect of list) {
      const last = runs[runs.length - 1];
      // Touching runs merge; so do runs separated only by empty space
      // (a checkbox's or code span's margin). Runs with other content of
      // the line between them (bidirectional text) stay apart.
      if (
        last &&
        (rect.left <= last.right + 1 ||
          !row.content.some(
            (box) => box.right > last.right + 0.5 && box.left < rect.left - 0.5,
          ))
      ) {
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
          row.top - origin.top,
          run.right - run.left,
          row.bottom - row.top,
        ),
      );
    }
  }
  return out;
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
  const rows = visualRows(view, block);
  const from = Math.max(range.from, block.from);
  const to = Math.min(range.to, block.to);
  if (to > from) {
    markers.push(...textMarkers(view, rows, { from, to }, geometry));
  }
  if (range.to > block.to && range.from <= block.to) {
    const end = view.coordsAtPos(block.to, -1) ?? view.coordsAtPos(block.to, 1);
    if (end) {
      const row = rowOf(rows, end);
      markers.push(
        new RectangleMarker(
          CLASS,
          end.left - origin.left,
          row.top - origin.top,
          block.length === 0 ? EMPTY_STUB : breakStub(view),
          row.bottom - row.top,
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
