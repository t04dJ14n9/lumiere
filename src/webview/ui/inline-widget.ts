import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderPass, RenderService } from "../../plugins/render/api";
/** Rendered inline content owns its pass even when rendering resolves after removal. */
export class MarkdownInline extends WidgetType {
  private readonly disposeDOM = new WeakMap<HTMLElement, () => void>();
  constructor(readonly source: string, private readonly render: RenderService) { super(); }
  override eq(other: MarkdownInline): boolean {
    return other instanceof MarkdownInline && other.source === this.source && other.render === this.render;
  }
  override toDOM(view: EditorView): HTMLElement {
    const node = document.createElement("span");
    node.className = "md-inline-render";
    let live = true;
    let pass: RenderPass | undefined;
    this.disposeDOM.set(node, () => { live = false; void pass?.dispose(); });
    void this.render.into(node, this.source, { measure: () => { if (live) view.requestMeasure(); } })
      .then((result) => {
        pass = result;
        if (!live) { void pass.dispose(); return; }
        const paragraph = node.firstElementChild;
        if (paragraph?.tagName === "P" && node.children.length === 1) paragraph.replaceWith(...paragraph.childNodes);
      }).catch(() => { if (live) node.textContent = this.source; });
    return node;
  }
  override ignoreEvent(): boolean { return false; }
  override destroy(node: HTMLElement): void {
    this.disposeDOM.get(node)?.();
    this.disposeDOM.delete(node);
  }
}
