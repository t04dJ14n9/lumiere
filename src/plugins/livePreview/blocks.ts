import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { blockRenderers, revealed } from "./registry";
import { documentTree } from "./document-tree";
import type { BlockRenderer, RenderBlock } from "./api";
export const refreshRender = StateEffect.define<null>();
export const renderRevision = StateField.define<number>({
  create: () => 0,
  update: (value, tr) =>
    tr.effects.some((effect) => effect.is(refreshRender)) ? value + 1 : value,
});
export const blockIndex = StateField.define<
  (RenderBlock & { renderer: BlockRenderer })[]
>({
  create: (state) => index(state),
  update(value, tr) {
    return tr.docChanged ||
      tr.startState.facet(blockRenderers) !== tr.state.facet(blockRenderers)
      ? index(tr.state)
      : value;
  },
});
function index(state: Parameters<typeof revealed>[0]) {
  const blocks: (RenderBlock & { renderer: BlockRenderer })[] = [];
  state.field(documentTree).iterate({
    enter(node) {
      if (blocks.length && node.from < blocks[blocks.length - 1]!.to) {
        return false;
      }
      const renderer = state
        .facet(blockRenderers)
        .find((r) => r.match(node, state));
      if (renderer) {
        const range = renderer.range?.(node, state) ?? node;
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
  return blocks;
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
    update(_value, tr) {
      return build(tr.state);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
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
