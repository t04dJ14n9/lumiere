import { Facet } from "@codemirror/state";
import { Direction, EditorView, ViewPlugin } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import type { Heading } from "../../markdown/metadata/heading-extract";
import { chromeInsetTop } from "../../webview/ui/chrome-inset";
import { headingIndex, stickyHeadings } from "./model";

export const stickyMaxLines = Facet.define<number, number>({
  combine: (values) => values.at(-1) ?? 5,
});

interface StickyLayout {
  headings: readonly Heading[];
  top: number;
  left: number;
  width: number;
  inset: number;
  rowHeight: number;
}

/** An overlay leaves the document's height and scroll anchor unchanged. */
export class StickyScrollView {
  readonly dom: HTMLElement;
  height = 0;
  private isDestroyed = false;
  private headings: readonly Heading[] = [];
  private rowHeight = 0;

  constructor(
    private readonly view: EditorView,
    private readonly navigate: (position: number) => void,
  ) {
    this.dom = view.dom.ownerDocument.createElement("nav");
    this.dom.className = "mw-sticky-scroll";
    this.dom.setAttribute("aria-label", "Sticky headings");
    this.dom.hidden = true;
    this.dom.addEventListener("wheel", (event) => this.scroll(event), {
      passive: false,
    });
    // Resolve the row from the event target (and Y as a fallback) so a click or
    // tooltip always matches the visible pin, not a parent row under the pointer.
    this.dom.addEventListener("click", (event) => this.activate(event));
    this.dom.addEventListener("pointermove", (event) =>
      this.syncHoverTitle(event),
    );
    this.dom.addEventListener("pointerleave", () => {
      this.dom.removeAttribute("title");
    });
    view.dom.append(this.dom);
    this.schedule();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      // Old buttons must not navigate with offsets from the previous document.
      this.dom.hidden = true;
      this.height = 0;
    }
    this.schedule();
  }

  schedule(): void {
    this.view.requestMeasure({
      key: this,
      read: () => (this.isDestroyed ? undefined : this.measure()),
      write: (layout) => {
        if (layout && !this.isDestroyed) {
          this.draw(layout);
        }
      },
    });
  }

  private measure(): StickyLayout {
    const view = this.view;
    const editor = view.dom.getBoundingClientRect();
    const scroll = view.scrollDOM.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    const rowHeight = view.defaultLineHeight;
    // Below the embedder's controls, where they float over the page.
    const top =
      scroll.top +
      view.scrollDOM.clientTop +
      chromeInsetTop(view.dom.ownerDocument);
    const limit = Math.min(
      view.state.facet(stickyMaxLines),
      Math.floor(view.scrollDOM.clientHeight / (3 * rowHeight)),
    );
    const index = view.state.field(headingIndex);
    // Probe the first line still visible *below* the sticky chrome. The
    // viewport top sits under the overlay (scroll margins keep the caret
    // below it), so measuring there would pin the section hidden behind the
    // chrome. Iterate until row count (and height) stabilize.
    let height = 0;
    let headings: readonly Heading[] = [];
    for (let step = 0; step < 6; step++) {
      const block = view.lineBlockAtHeight(
        Math.max(0, top + height - view.documentTop),
      );
      headings = stickyHeadings(index, block.from, limit);
      const nextHeight = headings.length * rowHeight;
      if (nextHeight === height) {
        break;
      }
      height = nextHeight;
    }
    return {
      headings,
      top: top - editor.top,
      left: scroll.left - editor.left,
      width: view.scrollDOM.clientWidth,
      inset: Math.max(
        0,
        view.textDirection === Direction.RTL
          ? scroll.right - content.right
          : content.left - scroll.left,
      ),
      rowHeight,
    };
  }

  private draw(layout: StickyLayout): void {
    const { dom } = this;
    dom.style.top = `${layout.top}px`;
    dom.style.left = `${layout.left}px`;
    dom.style.width = `${layout.width}px`;
    dom.style.setProperty("--sticky-inset", `${layout.inset}px`);
    dom.style.setProperty("--sticky-row-height", `${layout.rowHeight}px`);
    this.rowHeight = layout.rowHeight;
    if (!sameHeadings(this.headings, layout.headings)) {
      dom.replaceChildren(
        ...layout.headings.map((heading) => this.button(heading)),
      );
      this.headings = layout.headings;
    }
    dom.hidden = layout.headings.length === 0;
    this.height = layout.headings.length * layout.rowHeight;
  }

  private button(heading: Heading): HTMLButtonElement {
    const button = this.dom.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "mw-sticky-heading";
    const label = heading.label || "(Untitled heading)";
    button.textContent = label;
    button.title = `Go to heading: ${label}`;
    button.dataset.from = String(heading.from);
    button.dataset.label = label;
    button.style.setProperty("--sticky-depth", String(heading.level - 1));
    return button;
  }

  private headingAt(event: MouseEvent): Heading | undefined {
    const raw = event.target;
    const target =
      raw &&
      typeof raw === "object" &&
      "closest" in raw &&
      typeof (raw as Element).closest === "function"
        ? (raw as Element).closest<HTMLElement>("button.mw-sticky-heading")
        : null;
    if (target && this.dom.contains(target)) {
      const from = Number(target.dataset.from);
      return this.headings.find((heading) => heading.from === from);
    }
    if (this.rowHeight <= 0 || this.headings.length === 0) {
      return undefined;
    }
    const index = Math.floor(
      (event.clientY - this.dom.getBoundingClientRect().top) / this.rowHeight,
    );
    return this.headings[
      Math.max(0, Math.min(this.headings.length - 1, index))
    ];
  }

  private activate(event: MouseEvent): void {
    const heading = this.headingAt(event);
    if (!heading) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.navigate(heading.from);
  }

  private syncHoverTitle(event: MouseEvent): void {
    const heading = this.headingAt(event);
    if (!heading) {
      this.dom.removeAttribute("title");
      return;
    }
    const label = heading.label || "(Untitled heading)";
    const title = `Go to heading: ${label}`;
    this.dom.title = title;
    // Keep the row's own title in sync for assistive tech and native fallbacks.
    const raw = event.target;
    const target =
      raw &&
      typeof raw === "object" &&
      "closest" in raw &&
      typeof (raw as Element).closest === "function"
        ? (raw as Element).closest<HTMLElement>("button.mw-sticky-heading")
        : null;
    if (target && this.dom.contains(target) && target.title !== title) {
      target.title = title;
    }
  }

  private scroll(event: WheelEvent): void {
    if (event.ctrlKey) {
      return;
    }
    let scale = 1;
    if (event.deltaMode === 1) {
      scale = this.view.defaultLineHeight;
    } else if (event.deltaMode === 2) {
      scale = this.view.scrollDOM.clientHeight;
    }
    // The overlay is outside the scroller so it cannot shift document layout.
    // Wheel input over its rows must still reach the note underneath.
    this.view.scrollDOM.scrollBy(event.deltaX * scale, event.deltaY * scale);
    event.preventDefault();
  }

  destroy(): void {
    this.isDestroyed = true;
    this.height = 0;
    this.dom.remove();
  }
}

function sameHeadings(
  left: readonly Heading[],
  right: readonly Heading[],
): boolean {
  return (
    left.length === right.length &&
    left.every((heading, index) => heading === right[index])
  );
}

export function stickyScrollExtension(navigate: (position: number) => void) {
  const chrome = ViewPlugin.define(
    (view) => new StickyScrollView(view, navigate),
    {
      eventObservers: {
        scroll() {
          this.schedule();
        },
      },
    },
  );
  return [
    headingIndex,
    chrome,
    EditorView.scrollMargins.of((view) => ({
      // Host chrome only. Sticky pin height is applied as scrollIntoView
      // yMargin on pin click (see webview.ts) so resizing pins does not
      // retarget scrollTop mid-read.
      top: chromeInsetTop(view.dom.ownerDocument),
    })),
  ];
}
