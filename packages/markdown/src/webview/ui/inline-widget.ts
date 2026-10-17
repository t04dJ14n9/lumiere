import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderPass, RenderService } from "../../plugins/render/api";
import type { SourceSpan } from "./markdown-widget";

/** Rendered inline content owns its pass even when rendering resolves after removal. */
export class MarkdownInline extends WidgetType {
  private readonly disposeDOM = new WeakMap<HTMLElement, () => void>();
  constructor(
    readonly source: string,
    private readonly render: RenderService,
    /**
     * What a plain click selects, as offsets into the source (Obsidian
     * selects a formula without its `$`). Without it, clicks place the caret.
     */
    private readonly select?: (source: string) => SourceSpan,
  ) {
    super();
  }
  override eq(other: MarkdownInline): boolean {
    return (
      other instanceof MarkdownInline &&
      other.source === this.source &&
      other.render === this.render &&
      other.select === this.select
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const node = document.createElement("span");
    node.className = "md-inline-render";
    let live = true;
    let pass: RenderPass | undefined;
    const events = new AbortController();
    if (this.select) {
      node.addEventListener(
        "mousedown",
        (event) => this.selectOnClick(view, node, event),
        { signal: events.signal },
      );
    }
    this.disposeDOM.set(node, () => {
      live = false;
      events.abort();
      void pass?.dispose();
    });
    void this.render
      .into(node, this.source, {
        measure: () => {
          if (live) {
            view.requestMeasure();
          }
        },
      })
      .then((result) => {
        pass = result;
        if (!live) {
          void pass.dispose();
          return;
        }
        unwrapParagraph(node);
      })
      .catch(() => {
        if (live) {
          node.textContent = this.source;
        }
      });
    return node;
  }
  /** A plain click that selects is this widget's; others drive the editor. */
  override ignoreEvent(event: Event): boolean {
    return Boolean(this.select) && isPlainClick(event);
  }
  private selectOnClick(
    view: EditorView,
    node: HTMLElement,
    event: MouseEvent,
  ): void {
    if (!this.select || !isPlainClick(event)) {
      return;
    }
    event.preventDefault();
    const start = view.posAtDOM(node);
    const span = this.select(this.source);
    view.focus();
    // As in Obsidian, the selection's head is at its start.
    view.dispatch({
      selection: { anchor: start + span.to, head: start + span.from },
    });
  }
  override destroy(node: HTMLElement): void {
    this.disposeDOM.get(node)?.();
    this.disposeDOM.delete(node);
  }
}

/**
 * Inline content renders as one paragraph; keep only its contents. The
 * newlines around it would otherwise show as line breaks, because the editor
 * preserves white space.
 */
function unwrapParagraph(node: HTMLElement): void {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) {
      child.remove();
    }
  }
  const paragraph = node.firstElementChild;
  if (paragraph?.tagName === "P" && node.childNodes.length === 1) {
    paragraph.replaceWith(...paragraph.childNodes);
  }
}

/** A primary-button press without modifiers, which select or extend instead. */
function isPlainClick(event: Event): event is MouseEvent {
  return (
    event instanceof MouseEvent &&
    event.type === "mousedown" &&
    event.button === 0 &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  );
}
