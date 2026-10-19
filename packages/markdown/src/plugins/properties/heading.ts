import { type EditorView, ViewPlugin } from "@codemirror/view";

const headingSelector = ".hybrid-properties [data-properties-heading]";
/** Frames to wait for the header to be rendered after scrolling to it. */
const REVEAL_ATTEMPTS = 10;

/** Keep keyboard navigation available when paging unmounts the header widget. */
class PropertyHeadingFocus {
  private readonly proxy = document.createElement("span");
  /** A keyboard action is waiting for the header; scrolling must not refocus it first. */
  private revealing = false;

  constructor(
    private readonly view: EditorView,
    private readonly focusTitle: () => void,
  ) {
    this.proxy.className = "property-heading-focus";
    this.proxy.tabIndex = -1;
    this.proxy.setAttribute("role", "group");
    this.proxy.setAttribute("aria-label", "Properties");
    this.proxy.addEventListener("keydown", (event) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key === " ") {
        this.page(event.shiftKey);
      } else if (event.key === "Escape") {
        view.focus();
      } else if (event.key === "Tab" && event.shiftKey) {
        this.focusTitle();
      } else if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(
          event.key,
        )
      ) {
        const key = event.key === "Tab" ? "ArrowDown" : event.key;
        this.reveal((heading) => {
          heading.focus({ preventScroll: true });
          // Reuse the mounted control's navigation; never move the source caret
          // just to keep an offscreen widget alive.
          heading.dispatchEvent(
            new KeyboardEvent("keydown", {
              key,
              bubbles: true,
              cancelable: true,
            }),
          );
        });
      } else if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    });
    view.dom.append(this.proxy);
  }

  /**
   * ArrowUp from the first line of the body: Obsidian moves focus to the last
   * control of the Properties block (its "Add property" button, or the heading
   * when collapsed). An offscreen block is scrolled back into view first.
   */
  enter(): void {
    const target = (heading: HTMLElement): HTMLElement => {
      const add = heading
        .closest(".hybrid-properties")
        ?.querySelector<HTMLElement>("[data-property-add]");
      return add?.getClientRects().length ? add : heading;
    };
    const heading = this.view.dom.querySelector<HTMLElement>(headingSelector);
    if (heading?.getClientRects().length) {
      target(heading).focus();
      return;
    }
    this.proxy.focus({ preventScroll: true });
    this.reveal((revealed) => target(revealed).focus());
  }

  page(backward: boolean): void {
    this.proxy.focus({ preventScroll: true });
    this.view.scrollDOM.scrollBy({
      top: this.view.scrollDOM.clientHeight * (backward ? -0.875 : 0.875),
      behavior: "instant",
    });
    this.docViewUpdate();
  }

  docViewUpdate(): void {
    if (this.revealing || this.view.root.activeElement !== this.proxy) {
      return;
    }
    this.view.requestMeasure({
      key: this,
      read: (view) => {
        const heading = view.dom.querySelector<HTMLElement>(headingSelector);
        const rect = heading?.getBoundingClientRect();
        const viewport = view.scrollDOM.getBoundingClientRect();
        return rect && rect.bottom > viewport.top && rect.top < viewport.bottom
          ? heading
          : null;
      },
      write: (heading) => {
        // A pending keyboard reveal owns the focus change.
        if (!this.revealing && this.view.root.activeElement === this.proxy) {
          heading?.focus({ preventScroll: true });
        }
      },
    });
  }

  /**
   * Scroll to the top and act on the header once CodeMirror has rendered it
   * again, which can take a few frames after a long scroll.
   */
  private reveal(action: (heading: HTMLElement) => void): void {
    this.revealing = true;
    this.view.scrollDOM.scrollTop = 0;
    const attempt = (remaining: number): void => {
      this.view.requestMeasure({
        read: (view) => view.dom.querySelector<HTMLElement>(headingSelector),
        write: (heading) => {
          if (this.view.root.activeElement !== this.proxy) {
            this.revealing = false;
          } else if (heading) {
            this.revealing = false;
            action(heading);
          } else if (remaining > 0) {
            requestAnimationFrame(() => attempt(remaining - 1));
          } else {
            this.revealing = false;
          }
        },
      });
    };
    attempt(REVEAL_ATTEMPTS);
  }

  destroy(): void {
    this.proxy.remove();
  }
}

export const propertyHeadingFocus = (focusTitle: () => void) =>
  ViewPlugin.define((view) => new PropertyHeadingFocus(view, focusTitle));
