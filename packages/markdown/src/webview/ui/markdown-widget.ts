import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderBlock } from "../../plugins/livePreview/api";
import type { RenderPass, RenderService } from "../../plugins/render/api";
import {
  bindClickToEdit,
  bindDoubleClickToEdit,
  markdownBlockIgnoresEvent,
} from "./block-pointer";
import { bindFenceClickGuard } from "./fence-click-guard";

/** Own a render pass even when an async post-processor finishes after removal. */
export class MarkdownBlock extends WidgetType {
  private readonly lifetimes = new WeakMap<HTMLElement, () => void>();

  constructor(
    readonly block: RenderBlock,
    private readonly render: RenderService,
    /**
     * Body click policy for revealing source:
     * - `true` (default): single click, as for math / code / callouts.
     * - `"dblclick"`: double-click only (Mermaid stays interactive on ordinary click).
     * - `false`: Edit button / caret entry only (embeds keep content clicks).
     */
    private readonly clickToEdit: boolean | "dblclick" = true,
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
    if (this.clickToEdit === true) {
      bindClickToEdit(view, shell, events.signal);
    } else if (this.clickToEdit === "dblclick") {
      bindDoubleClickToEdit(view, shell, events.signal);
      bindFenceClickGuard(view, shell, this.block, events.signal);
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

  /**
   * Keep widget events (including blank diagram area) so CodeMirror does not
   * park the caret inside the replaced fence on click — that would reveal
   * Mermaid/math source without Edit / click-to-edit. Buttons and Mermaid SVG
   * labels stay native; document-level MouseSelection still covers drags that
   * start outside the widget.
   */
  override ignoreEvent(event: Event): boolean {
    return markdownBlockIgnoresEvent(event);
  }

  override destroy(dom: HTMLElement): void {
    this.lifetimes.get(dom)?.();
    this.lifetimes.delete(dom);
  }
}
