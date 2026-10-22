import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { PropertyContext } from "./context";
import { sanitize } from "./sanitize";
import {
  propertyMarkup,
  rememberPropertyRows,
  reconcileProperties,
} from "./sheet";
import { bindPropertyFields } from "./fields";
import { bindPropertyLists } from "./lists";
import { bindPropertyControls } from "./controls";
import { keepSelectAllInField } from "./select-all";
import { propertiesHeightFromMarkup } from "./estimated-height";

const lifetimes = new WeakMap<HTMLElement, () => void>();

export class PropertyWidget extends WidgetType {
  private cachedMarkup?: string;
  private cachedHeight?: number;

  constructor(
    readonly source: string,
    readonly context: PropertyContext,
    readonly hidden: boolean,
    readonly allowEmpty = false,
  ) {
    super();
  }
  override eq(other: PropertyWidget): boolean {
    return (
      this.source === other.source &&
      this.hidden === other.hidden &&
      this.allowEmpty === other.allowEmpty &&
      this.context === other.context
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "hybrid-properties";
    if (this.hidden) {
      return wrapper;
    }
    const container = document.createElement("div");
    wrapper.append(container);
    container.innerHTML = sanitize(this.sheetMarkup());
    rememberPropertyRows(container);
    this.context.bindRenderedProperties?.(container);
    bindPropertyFields(container, this.source, this.context);
    const lists = bindPropertyLists(container, this.source, this.context);
    const controls = bindPropertyControls(container, this.source, this.context);
    const selectAll = keepSelectAllInField(wrapper);
    // WorkVault Sources wrap after first paint; without a resize watch the
    // height map stays at the short first measure and Escape/caret geometry
    // land in the overflowing sheet tail (decision_confirmation overlap).
    const resize =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            if (wrapper.isConnected) {
              view.requestMeasure();
            }
          });
    resize?.observe(wrapper);
    lifetimes.set(wrapper, () => {
      resize?.disconnect();
      lists();
      controls();
      selectAll();
    });
    // Tall sheets (e.g. 100+ Sources) must enter the height map before the
    // first scroll/PageDown; otherwise the body paints blank under an
    // overflowing one-line reserve. minHeight keeps the estimate until
    // measure / ResizeObserver see the finished wrap.
    const reserve = this.estimatedHeight;
    if (reserve > 0 && wrapper.style) {
      wrapper.style.minHeight = `${reserve}px`;
    }
    queueMicrotask(() => {
      if (wrapper.isConnected) {
        view.requestMeasure();
      }
    });
    return wrapper;
  }
  override updateDOM(
    dom: HTMLElement,
    view: EditorView,
    previous: this,
  ): boolean {
    if (this.context !== previous.context) {
      return false;
    }
    if (this.hidden || previous.hidden) {
      return this.hidden === previous.hidden;
    }
    // Source/context change invalidates the create-time markup cache.
    delete this.cachedMarkup;
    delete this.cachedHeight;
    const ok =
      !!dom.firstElementChild &&
      reconcileProperties(
        dom.firstElementChild as HTMLElement,
        this.source,
        this.context,
      );
    if (ok) {
      const reserve = this.estimatedHeight;
      if (reserve > 0 && dom.style) {
        dom.style.minHeight = `${reserve}px`;
      }
      queueMicrotask(() => {
        if (dom.isConnected) {
          view.requestMeasure();
        }
      });
    }
    return ok;
  }
  override destroy(dom: HTMLElement): void {
    lifetimes.get(dom)?.();
    lifetimes.delete(dom);
  }
  override ignoreEvent(): boolean {
    return true;
  }
  /**
   * Reserve the sheet's rows before CodeMirror has measured the widget.
   * Without this the height map treats the whole frontmatter as one line.
   */
  override get estimatedHeight(): number {
    if (this.hidden) {
      return 0;
    }
    if (this.cachedHeight !== undefined) {
      return this.cachedHeight;
    }
    this.cachedHeight = propertiesHeightFromMarkup(this.sheetMarkup());
    return this.cachedHeight;
  }

  /** One renderProperties per widget lifetime for height + toDOM. */
  private sheetMarkup(): string {
    if (this.cachedMarkup !== undefined) {
      return this.cachedMarkup;
    }
    this.cachedMarkup = propertyMarkup(
      this.source,
      this.context,
      this.allowEmpty,
    );
    return this.cachedMarkup;
  }
}
