import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { blockRenderers, revealed } from "./registry";
import { documentTree } from "./document-tree";
import type { BlockRenderer, RenderBlock } from "./api";
import {
  changedRegion,
  changesMetadata,
  renderInvalidations,
  type Region,
} from "./invalidation";
type IndexedBlock = RenderBlock & { renderer: BlockRenderer };
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
      tr.startState.facet(blockRenderers) !== tr.state.facet(blockRenderers)
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
  let escaped = false;
  state.field(documentTree).iterate({
    ...(region && { from: region.from, to: region.to }),
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
      const renderer = state
        .facet(blockRenderers)
        .find((r) => r.match(node, state));
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

function blockDecoration(
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
 * Decorations for every block. A transaction that changes metadata (an
 * effect, a reconfiguration, the renderers) redraws every block. Otherwise
 * only blocks that are new to the index (found again, or shifted by an
 * edit above them) or that the selection entered or left are decorated
 * again (`renderInvalidations`); the rest keep their decorations. Widgets
 * whose source did not change keep their DOM either way (`GuardedWidget.eq`).
 */
export function blockDecorations(report: (error: unknown) => void) {
  const build = (state: Parameters<typeof revealed>[0]): DecorationSet =>
    Decoration.set(
      state
        .field(blockIndex)
        .flatMap((block) => blockDecoration(state, block, report)),
      true,
    );
  return StateField.define<DecorationSet>({
    create: build,
    update(value, tr) {
      if (changesMetadata(tr) || !tr.startState.field(blockIndex, false)) {
        return build(tr.state);
      }
      if (!tr.docChanged && !tr.selection) {
        return value;
      }
      return redecorate(value, tr, report) ?? build(tr.state);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

function redecorate(
  value: DecorationSet,
  tr: Parameters<typeof renderInvalidations>[0],
  report: (error: unknown) => void,
): DecorationSet | undefined {
  const blocks = tr.state.field(blockIndex);
  const unchanged = new Set(tr.startState.field(blockIndex));
  const lines = renderInvalidations(tr).map(({ fromLine, toLine }) => ({
    from: tr.state.doc.line(fromLine).from,
    to: tr.state.doc.line(toLine).to,
  }));
  const kept: IndexedBlock[] = [];
  const dirty: IndexedBlock[] = [];
  for (const block of blocks) {
    const touched = lines.some(
      (line) => line.from <= block.to && line.to >= block.from,
    );
    (unchanged.has(block) && !touched ? kept : dirty).push(block);
  }
  if (2 * dirty.length > blocks.length + 1) {
    return undefined;
  }
  return value.map(tr.changes).update({
    filter: (from, to) => containing(kept, from, to),
    add: dirty.flatMap((block) => blockDecoration(tr.state, block, report)),
    sort: true,
  });
}

/** Whether a kept block (sorted, disjoint) contains `[from, to]`. */
function containing(
  blocks: readonly IndexedBlock[],
  from: number,
  to: number,
): boolean {
  let low = 0;
  let high = blocks.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const block = blocks[middle]!;
    if (block.to < from) {
      low = middle + 1;
    } else if (block.from > to) {
      high = middle - 1;
    } else {
      return block.from <= from && to <= block.to;
    }
  }
  return false;
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
