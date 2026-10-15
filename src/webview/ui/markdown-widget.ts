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
      bindClickToEdit(view, shell, events.signal);
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
   * Let CodeMirror drive mouse selection through the block (so a drag keeps
   * scroll stable and can cover diagram source). Buttons keep their own clicks.
   */
  override ignoreEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Element && Boolean(target.closest(interactive));
  }

  override destroy(dom: HTMLElement): void {
    this.lifetimes.get(dom)?.();
    this.lifetimes.delete(dom);
  }
}

/** Controls inside a rendered block keep their own click behaviour. */
const interactive =
  "a, button, input, select, textarea, summary, label, [contenteditable='true'], [data-href], .internal-link, .external-link";

const CLICK_DRAG_PX = 3;

/**
 * Reveal source on a true click, not on mousedown. Mousedown-to-edit jumped
 * the viewport (`scrollIntoView` to the fence start) and swallowed drags, so
 * Mermaid/math blocks could not be selected without scrolling to the block top.
 */
function bindClickToEdit(
  view: EditorView,
  shell: HTMLElement,
  signal: AbortSignal,
): void {
  let origin: { x: number; y: number } | null = null;
  shell.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0 || isBlockControl(shell, event.target)) {
        origin = null;
        return;
      }
      origin = { x: event.clientX, y: event.clientY };
    },
    { signal },
  );
  shell.addEventListener(
    "mouseup",
    (event) => {
      if (
        !origin ||
        event.button !== 0 ||
        isBlockControl(shell, event.target)
      ) {
        origin = null;
        return;
      }
      const dragged =
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
        CLICK_DRAG_PX;
      origin = null;
      if (!dragged) {
        editOnClick(view, shell);
      }
    },
    { signal },
  );
}

function isBlockControl(
  shell: HTMLElement,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const control = target.closest(interactive);
  return Boolean(control && control !== shell && shell.contains(control));
}

/**
 * Clicking a rendered block (math, code, a callout, a diagram) reveals its
 * source with the caret at the end of the first line, as in Obsidian. The
 * click was already on-screen, so do not force a scroll to the fence start.
 */
export function editOnClick(view: EditorView, shell: HTMLElement): void {
  const line = view.state.doc.lineAt(view.posAtDOM(shell));
  view.focus();
  view.dispatch({ selection: { anchor: line.to }, scrollIntoView: false });
}
