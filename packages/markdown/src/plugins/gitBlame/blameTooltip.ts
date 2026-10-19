import type { EditorState, Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { placePreview } from "../../webview/ui/popover-position";

type Box = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

export function isInside(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** Time to cross the gap from the ghost into its tooltip. */
const HIDE_DELAY_MS = 120;

/** The full commit message, fixed to the page so no scroller clips it. */
export class BlameTooltip {
  private readonly tip: HTMLElement;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly events = new AbortController();

  constructor(doc: Document) {
    this.tip = doc.createElement("div");
    this.tip.className = "mw-gb-tooltip";
    this.tip.hidden = true;
    this.tip.setAttribute("role", "tooltip");
    this.tip.setAttribute("data-mw-selection-ignore", "");
    doc.documentElement.append(this.tip);
    const options = { signal: this.events.signal };
    this.tip.addEventListener("mouseenter", () => this.keep(), options);
    this.tip.addEventListener("mouseleave", () => this.hide(), options);
  }

  show(text: string, anchor: Box): void {
    this.keep();
    if (this.tip.hidden || this.tip.textContent !== text) {
      this.tip.textContent = text;
      this.tip.hidden = false;
    }
    const root = this.tip.ownerDocument.documentElement;
    const box = this.tip.getBoundingClientRect();
    const { left, top, isAbove } = placePreview(
      { width: box.width, height: box.height },
      anchor,
      { width: root.clientWidth, height: root.clientHeight },
    );
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${top}px`;
    this.tip.classList.toggle("is-above", isAbove);
  }

  hideSoon(): void {
    if (this.tip.hidden || this.hideTimer !== undefined) {
      return;
    }
    this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  hide(): void {
    this.keep();
    this.tip.hidden = true;
  }

  destroy(): void {
    this.keep();
    this.events.abort();
    this.tip.remove();
  }

  private keep(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }
}

/**
 * The ghost lets every click through to the text (it sits where a click puts
 * the caret at the end of the line), so hovering is found by position rather
 * than by pointer events on the ghost itself.
 */
export function blameHover(
  tooltipAt: (state: EditorState) => string | undefined,
): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly tooltip: BlameTooltip;
      private readonly events = new AbortController();

      constructor(private readonly view: EditorView) {
        this.tooltip = new BlameTooltip(view.dom.ownerDocument);
        const options = { signal: this.events.signal, passive: true };
        view.scrollDOM.addEventListener(
          "mousemove",
          (event) => this.follow(event),
          options,
        );
        view.scrollDOM.addEventListener(
          "mouseleave",
          () => this.tooltip.hideSoon(),
          options,
        );
      }

      update(update: ViewUpdate): void {
        if (
          update.geometryChanged ||
          tooltipAt(update.state) !== tooltipAt(update.startState)
        ) {
          this.tooltip.hide();
        }
      }

      destroy(): void {
        this.events.abort();
        this.tooltip.destroy();
      }

      private follow(event: MouseEvent): void {
        const text = tooltipAt(this.view.state);
        const ghost =
          this.view.scrollDOM.querySelector<HTMLElement>(".mw-gb-ghost");
        const box = ghost?.getBoundingClientRect();
        if (text && box && isInside(box, event.clientX, event.clientY)) {
          this.tooltip.show(text, box);
        } else {
          this.tooltip.hideSoon();
        }
      }
    },
  );
}
