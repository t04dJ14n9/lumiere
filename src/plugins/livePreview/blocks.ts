import { StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { blockRenderers, revealed } from "./registry";
import { documentTree } from "./document-tree";
import type { BlockRenderer, RenderBlock } from "./api";
export const blockIndex = StateField.define<(RenderBlock & { renderer: BlockRenderer })[]>({
  create: (state) => index(state),
  update(value, tr) {
    return tr.docChanged || tr.startState.facet(blockRenderers) !== tr.state.facet(blockRenderers)
      ? index(tr.state)
      : value;
  },
});
function index(state: Parameters<typeof revealed>[0]) {
  const blocks: (RenderBlock & { renderer: BlockRenderer })[] = [];
  state.field(documentTree).iterate({
    enter(node) {
      const renderer = state.facet(blockRenderers).find((r) => r.match(node, state));
      if (renderer) {
        blocks.push({
          from: node.from,
          to: node.to,
          kind: renderer.kind,
          source: state.sliceDoc(node.from, node.to),
          renderer,
        });
        return false;
      }
      return undefined;
    },
  });
  return blocks;
}
class GuardedWidget extends WidgetType {
  constructor(
    readonly block: RenderBlock,
    readonly widget: WidgetType,
    private readonly report: (error: unknown) => void,
  ) {
    super();
  }
  override eq(other: GuardedWidget): boolean {
    return (
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
export function blockDecorations(report: (error: unknown) => void) {
  const build = (state: Parameters<typeof revealed>[0]): DecorationSet =>
    Decoration.set(
      state.field(blockIndex).flatMap((block) => {
        if (block.renderer.editing === "reveal" && revealed(state, block.from, block.to)) return [];
        try {
          return [
            Decoration.replace({
              block: true,
              widget: new GuardedWidget(block, block.renderer.widget(block), report),
            }).range(block.from, block.to),
          ];
        } catch (error) {
          report(error);
          return [];
        }
      }),
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
