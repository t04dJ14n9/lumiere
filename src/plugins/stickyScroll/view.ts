import { Facet } from "@codemirror/state";
import { Direction, EditorView, ViewPlugin } from "@codemirror/view";
import type { ViewUpdate } from "@codemirror/view";
import type { Heading } from "../../markdown/metadata/heading-extract";
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
    const top = scroll.top + view.scrollDOM.clientTop;
    const block = view.lineBlockAtHeight(Math.max(0, top - view.documentTop));
    const limit = Math.min(
      view.state.facet(stickyMaxLines),
      Math.floor(view.scrollDOM.clientHeight / (3 * rowHeight)),
    );
    return {
      headings: stickyHeadings(
        view.state.field(headingIndex),
        block.from,
        limit,
      ),
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
    button.textContent = heading.label || "(Untitled heading)";
    button.title = `Go to heading: ${button.textContent}`;
    button.style.setProperty("--sticky-depth", String(heading.level - 1));
    button.addEventListener("click", () => this.navigate(heading.from));
    return button;
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
      top: view.plugin(chrome)?.height ?? 0,
    })),
  ];
}
