import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderBlock } from "../../plugins/livePreview/api";
import type { RenderPass, RenderService } from "../../plugins/render/api";

/** Own a render pass even when an async post-processor finishes after removal. */
export class MarkdownBlock extends WidgetType {
  private readonly lifetimes = new WeakMap<HTMLElement, () => void>();

  constructor(
    readonly block: RenderBlock,
    private readonly render: RenderService,
    private readonly clickToEdit = true,
  ) {
    super();
  }

  override eq(other: MarkdownBlock): boolean {
    return (
      this.render === other.render && this.block.source === other.block.source
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const shell = document.createElement("section");
    shell.className = `hybrid-block hybrid-${this.block.kind}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-block";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${this.block.kind} source`);
    const body = document.createElement("div");
    shell.append(edit, body);
    let live = true;
    let pass: RenderPass | undefined;
    const events = new AbortController();
    edit.addEventListener(
      "click",
      () => {
        const from = view.posAtDOM(shell);
        view.dispatch({ selection: { anchor: from }, scrollIntoView: true });
        view.focus();
      },
      { signal: events.signal },
    );
    if (this.clickToEdit) {
      shell.addEventListener(
        "mousedown",
        (event) => editOnClick(view, shell, event),
        { signal: events.signal },
      );
    }
    this.lifetimes.set(shell, () => {
      live = false;
      events.abort();
      void pass?.dispose();
    });
    void this.render
      .into(body, this.block.source, {
        sourceLine: view.state.doc.lineAt(this.block.from).number - 1,
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
        }
      })
      .catch(() => {
        if (live) {
          body.textContent = this.block.source;
          shell.classList.add("render-error");
          view.requestMeasure();
        }
      });
    return shell;
  }

  override destroy(dom: HTMLElement): void {
    this.lifetimes.get(dom)?.();
    this.lifetimes.delete(dom);
  }
}

/** Controls inside a rendered block keep their own click behaviour. */
const interactive =
  "a, button, input, select, textarea, summary, label, [contenteditable='true'], [data-href], .internal-link, .external-link";

/**
 * Clicking a rendered block (math, code, a callout, a diagram) reveals its
 * source with the caret at the end of the first line, as in Obsidian.
 */
export function editOnClick(
  view: EditorView,
  shell: HTMLElement,
  event: MouseEvent,
): void {
  const target = event.target;
  // Only controls inside the block count (the editor content around it is
  // contenteditable, and the editor marks the block itself as not editable).
  const control =
    target instanceof Element ? target.closest(interactive) : null;
  if (
    event.button !== 0 ||
    (control && control !== shell && shell.contains(control))
  ) {
    return;
  }
  // The editor's own mousedown handling would move the caret back out.
  event.preventDefault();
  event.stopPropagation();
  const line = view.state.doc.lineAt(view.posAtDOM(shell));
  // Focus first: focusing afterwards would restore the browser's old DOM
  // selection, which the editor then reads back.
  view.focus();
  view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
}
