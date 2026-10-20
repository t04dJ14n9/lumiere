import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderPass, RenderService } from "../../plugins/render/api";
import type { SourceSpan } from "./markdown-widget";
import { selectRenderedSource } from "./source-selection";

/**
 * What a plain click on rendered inline content does, as in Obsidian:
 * select part of its source, as offsets into it (a formula without its `$`,
 * an embedded note whole), or nothing at all (an image). Links and other
 * controls inside it keep their clicks.
 */
export type InlineClick = { select: (source: string) => SourceSpan } | "none";

/** Rendered inline content owns its pass even when rendering resolves after removal. */
export class MarkdownInline extends WidgetType {
  private readonly disposeDOM = new WeakMap<HTMLElement, () => void>();
  constructor(
    readonly source: string,
    private readonly render: RenderService,
    /** Without it, clicks place the caret. Pass a constant: widgets compare it. */
    private readonly click?: InlineClick,
  ) {
    super();
  }
  override eq(other: MarkdownInline): boolean {
    return (
      other instanceof MarkdownInline &&
      other.source === this.source &&
      other.render === this.render &&
      other.click === this.click
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const node = document.createElement("span");
    node.className = "md-inline-render";
    let live = true;
    let pass: RenderPass | undefined;
    const events = new AbortController();
    if (this.click) {
      node.addEventListener(
        "mousedown",
        (event) => this.onClick(view, node, event),
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
  /** A plain click this widget handles is its own; others drive the editor. */
  override ignoreEvent(event: Event): boolean {
    return (
      Boolean(this.click) &&
      (event.type === "selectionchange" || isPlainClick(event))
    );
  }
  private onClick(
    view: EditorView,
    node: HTMLElement,
    event: MouseEvent,
  ): void {
    if (!this.click || !isPlainClick(event) || onControl(node, event.target)) {
      return;
    }
    event.preventDefault();
    if (this.click === "none") {
      return;
    }
    const start = view.posAtDOM(node);
    const span = this.click.select(this.source);
    selectRenderedSource(view, {
      from: start + span.from,
      to: start + span.to,
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

/** A link, button or field inside the content, which keeps its own clicks. */
function onControl(node: HTMLElement, target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    node.contains(target) &&
    target.closest("a, button, input, [data-href]") !== null
  );
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
