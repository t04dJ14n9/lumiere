import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderBlock } from "./api";
import type { RenderPass, RenderService } from "../render/api";

/** Own a render pass even when an async post-processor finishes after removal. */
export class MarkdownBlock extends WidgetType {
  private readonly lifetimes = new WeakMap<HTMLElement, () => void>();

  constructor(
    readonly block: RenderBlock,
    private readonly render: RenderService,
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
    shell.className = "hybrid-block";
    const edit = document.createElement("button");
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
    this.lifetimes.set(shell, () => {
      live = false;
      events.abort();
      void pass?.dispose();
    });
    void this.render
      .into(body, this.block.source, {
        sourceLine: view.state.doc.lineAt(this.block.from).number - 1,
        measure: () => {
          if (live) view.requestMeasure();
        },
      })
      .then((result) => {
        pass = result;
        if (!live) void pass.dispose();
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
