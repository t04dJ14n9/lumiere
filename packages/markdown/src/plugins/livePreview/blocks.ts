import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { blockRenderers, revealed } from "./registry";
import { documentTree, replaceDocumentTree } from "./document-tree";
import type { BlockRenderer, RenderBlock } from "./api";
import { rendererMatcher, visitRendererNodes } from "./block-discovery";
import {
  changedRegion,
  renderInvalidations,
  type Region,
} from "./invalidation";
export type IndexedBlock = RenderBlock & { renderer: BlockRenderer };
export const refreshRender = StateEffect.define<null>();
export const renderRevision = StateField.define<number>({
  create: () => 0,
  update: (value, tr) =>
    tr.effects.some((effect) => effect.is(refreshRender)) ? value + 1 : value,
});
/**
 * The rendered blocks, in document order, never overlapping.
 *
 * Invariant: after a text change only the blocks in `changedRegion` are
 * found again. Blocks before it are the same objects; blocks after it are
 * new objects with shifted positions and the same source. A renderer's
 * `match` and `range` may read only the node and the text around it; a
 * renderer that depends on anything else must change the renderer facet
 * (or dispatch an effect, which redraws every block) when that changes.
 */
export const blockIndex = StateField.define<IndexedBlock[]>({
  create: (state) => index(state),
  update(value, tr) {
    if (
      tr.startState.facet(blockRenderers) !== tr.state.facet(blockRenderers) ||
      tr.effects.some((effect) => effect.is(replaceDocumentTree))
    ) {
      return index(tr.state);
    }
    return tr.docChanged ? reindex(value, tr) : value;
  },
});

/** Index again only the region the change touched (see `blockIndex`). */
function reindex(
  previous: readonly IndexedBlock[],
  tr: Parameters<typeof changedRegion>[0],
): IndexedBlock[] {
  let region = changedRegion(tr)!;
  for (const block of previous) {
    const from = tr.changes.mapPos(block.from, 1);
    const to = tr.changes.mapPos(block.to, -1);
    // A block that straddles the region edge is found again whole.
    if (from <= region.to && to >= region.from) {
      region = {
        from: Math.min(region.from, from),
        to: Math.max(region.to, to),
      };
    }
  }
  if (2 * (region.to - region.from) > tr.state.doc.length) {
    return index(tr.state);
  }
  const found = index(tr.state, region);
  if (!found) {
    return index(tr.state);
  }
  const blocks: IndexedBlock[] = [];
  for (const block of previous) {
    if (block.to < region.from) {
      blocks.push(block);
    }
  }
  blocks.push(...found);
  for (const block of previous) {
    const from = tr.changes.mapPos(block.from, 1);
    if (from > region.to) {
      blocks.push({ ...block, from, to: tr.changes.mapPos(block.to, -1) });
    }
  }
  return blocks;
}

/**
 * Blocks in `region` (all of them without one). `undefined` when a block
 * found there reaches outside it, so the caller indexes everything.
 */
function index(state: Parameters<typeof revealed>[0]): IndexedBlock[];
function index(
  state: Parameters<typeof revealed>[0],
  region: Region,
): IndexedBlock[] | undefined;
function index(
  state: Parameters<typeof revealed>[0],
  region?: Region,
): IndexedBlock[] | undefined {
  const blocks: IndexedBlock[] = [];
  const renderers = state.facet(blockRenderers);
  if (!renderers.length) {
    return blocks;
  }
  const matchRenderer = rendererMatcher(renderers);
  let escaped = false;
  visitRendererNodes(state.field(documentTree), {
    renderers,
    ...(region && { region }),
    enter(node) {
      if (
        region &&
        node.name !== "Document" &&
        (node.to < region.from || node.from > region.to)
      ) {
        return false;
      }
      if (blocks.length && node.from < blocks[blocks.length - 1]!.to) {
        return false;
      }
      const renderer = matchRenderer(node, state);
      if (renderer) {
        const range = renderer.range?.(node, state) ?? node;
        if (region && (range.from < region.from || range.to > region.to)) {
          escaped = true;
        }
        blocks.push({
          from: range.from,
          to: range.to,
          kind: renderer.kind,
          source: state.sliceDoc(range.from, range.to),
          renderer,
        });
        // A renderer may claim only the start of a node (one footnote
        // definition of a paragraph holding several); later children can
        // still be blocks of their own.
        return range.to < node.to ? undefined : false;
      }
      return undefined;
    },
  });
  return escaped ? undefined : blocks;
}
class GuardedWidget extends WidgetType {
  constructor(
    readonly block: RenderBlock & { renderer: BlockRenderer },
    readonly widget: WidgetType,
    readonly revision: number,
    private readonly report: (error: unknown) => void,
  ) {
    super();
  }
  override eq(other: GuardedWidget): boolean {
    return (
      this.revision === other.revision &&
      this.block.renderer === other.block.renderer &&
      this.block.kind === other.block.kind &&
      this.block.source === other.block.source &&
      this.widget.eq(other.widget)
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    try {
      return this.widget.toDOM(view);
    } catch (error) {
      this.report(error);
      const source = document.createElement("pre");
      source.className = "render-error";
      source.textContent = this.block.source;
      return source;
    }
  }
  override updateDOM(dom: HTMLElement, view: EditorView, from: this): boolean {
    try {
      return this.widget.updateDOM(dom, view, from.widget);
    } catch (error) {
      this.report(error);
      return false;
    }
  }
  override destroy(dom: HTMLElement): void {
    this.widget.destroy(dom);
  }
  override ignoreEvent(event: Event): boolean {
    return this.widget.ignoreEvent(event);
  }
  override get estimatedHeight(): number {
    return this.widget.estimatedHeight;
  }
}
function guarded(
  state: Parameters<typeof revealed>[0],
  block: RenderBlock & { renderer: BlockRenderer },
  report: (error: unknown) => void,
): GuardedWidget {
  return new GuardedWidget(
    block,
    block.renderer.widget(block),
    state.field(renderRevision, false) ?? 0,
    report,
  );
}

/** Revealed source lines, highlighted, with the rendered result below. */
export function editingDecorations(
  state: Parameters<typeof revealed>[0],
  block: RenderBlock & { renderer: BlockRenderer },
  widget: () => WidgetType,
): Range<Decoration>[] {
  const preview = block.renderer.editingPreview;
  if (!preview) {
    return [];
  }
  const lines: Range<Decoration>[] = [];
  const last = state.doc.lineAt(block.to).number;
  for (let n = state.doc.lineAt(block.from).number; n <= last; n++) {
    lines.push(
      Decoration.line({ class: preview.sourceClass }).range(
        state.doc.line(n).from,
      ),
    );
  }
  lines.push(
    Decoration.widget({ block: true, side: 1, widget: widget() }).range(
      block.to,
    ),
  );
  return lines;
}

export function blockDecoration(
  state: Parameters<typeof revealed>[0],
  block: RenderBlock & { renderer: BlockRenderer },
  report: (error: unknown) => void,
): Range<Decoration>[] {
  try {
    if (block.renderer.showSource?.(state, block)) {
      return [];
    }
    if (
      block.renderer.editing === "reveal" &&
      revealed(state, block.from, block.to)
    ) {
      return editingDecorations(state, block, () =>
        guarded(state, block, report),
      );
    }
    return [
      Decoration.replace({
        block: true,
        widget: guarded(state, block, report),
      }).range(block.from, block.to),
    ];
  } catch (error) {
    report(error);
    return [];
  }
}

/**
 * Decorate again only the spans that may have changed: the lines
 * `renderInvalidations` names, and after a text change everything from the
 * changed region on (blocks there are new objects, shifted ones included,
 * because their widgets hold source coordinates). Each span is widened to
 * the blocks it touches. Blocks are found by binary search, so a caret move
 * costs O(log blocks + touched) and an edit O(log blocks + blocks after
 * it). `undefined` (decorate everything) when most blocks are dirty or the
 * index was rebuilt whole.
 */
export function redecorate(
  value: DecorationSet,
  tr: Parameters<typeof renderInvalidations>[0],
  report: (error: unknown) => void,
  decorate: (
    state: Parameters<typeof revealed>[0],
    block: IndexedBlock,
    report: (error: unknown) => void,
  ) => Range<Decoration>[] = (state, block, reportError) =>
    blockDecoration(state, block, reportError),
): DecorationSet | undefined {
  const blocks = tr.state.field(blockIndex);
  const doc = tr.state.doc;
  const spans = renderInvalidations(tr).map(({ fromLine, toLine }) => ({
    from: doc.line(fromLine).from,
    to: doc.line(toLine).to,
  }));
  const region = changedRegion(tr);
  if (region) {
    const same = firstEndingAtOrAfter(blocks, region.from);
    const before = tr.startState.field(blockIndex);
    if (same > 0 && blocks[same - 1] !== before[same - 1]) {
      return undefined;
    }
    if (2 * (blocks.length - same) > blocks.length + 1) {
      return undefined;
    }
    spans.push({
      from: Math.min(region.from, blocks[same]?.from ?? region.from),
      to: doc.length,
    });
  }
  let set = value.map(tr.changes);
  for (const span of widened(tr.state, blocks, spans)) {
    const dirty = blocks.slice(span.first, span.last);
    set = set.update({
      filterFrom: span.from,
      filterTo: span.to,
      filter: (from, to) => from < span.from || to > span.to,
      add: dirty.flatMap((block) => decorate(tr.state, block, report)),
      sort: true,
    });
  }
  return set;
}

/** The index of the first block (sorted, disjoint) with `to >= position`. */
function firstEndingAtOrAfter(
  blocks: readonly IndexedBlock[],
  position: number,
): number {
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (blocks[middle]!.to < position) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * Spans widened to cover every block they touch (from the start of its
 * first line, where an editing block's line decorations begin), merged
 * where they meet, in order, with the blocks inside each (`first` to
 * `last`, exclusive).
 */
function widened(
  state: EditorState,
  blocks: readonly IndexedBlock[],
  spans: readonly Region[],
): (Region & { first: number; last: number })[] {
  const result: (Region & { first: number; last: number })[] = [];
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  for (const { from, to } of sorted) {
    const first = firstEndingAtOrAfter(blocks, from);
    let last = first;
    while (last < blocks.length && blocks[last]!.from <= to) {
      last++;
    }
    const start = last > first ? blocks[first]!.from : from;
    const span = {
      from: Math.min(from, state.doc.lineAt(start).from),
      to: Math.max(to, last > first ? blocks[last - 1]!.to : to),
      first,
      last,
    };
    const previous = result.at(-1);
    if (previous && span.from <= previous.to) {
      previous.to = Math.max(previous.to, span.to);
      previous.last = Math.max(previous.last, span.last);
    } else {
      result.push(span);
    }
  }
  return result;
}

/** Positions inside a replacement remain reachable immediately after its rendered block. */
export function visiblePosition(
  state: EditorState,
  position: number,
): { position: number; block: boolean } {
  const block = state
    .field(blockIndex, false)
    ?.find((block) => block.from <= position && position < block.to);
  if (
    !block ||
    (block.renderer.editing === "reveal" &&
      revealed(state, block.from, block.to)) ||
    block.renderer.showSource?.(state, block)
  ) {
    return { position, block: false };
  }
  return { position: block.to, block: true };
}
