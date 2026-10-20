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
import { propertiesEstimatedHeight } from "./estimated-height";
const lifetimes = new WeakMap<HTMLElement, () => void>();
export class PropertyWidget extends WidgetType {
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
    container.innerHTML = sanitize(
      propertyMarkup(this.source, this.context, this.allowEmpty),
    );
    rememberPropertyRows(container);
    this.context.bindRenderedProperties?.(container);
    bindPropertyFields(container, this.source, this.context);
    const lists = bindPropertyLists(container, this.source, this.context);
    const controls = bindPropertyControls(container, this.source, this.context);
    const selectAll = keepSelectAllInField(wrapper);
    lifetimes.set(wrapper, () => {
      lists();
      controls();
      selectAll();
    });
    // Tall sheets (e.g. 100+ Sources) must enter the height map before the
    // first scroll/PageDown; otherwise the body paints blank under an
    // overflowing one-line reserve.
    queueMicrotask(() => {
      if (wrapper.isConnected) {
        view.requestMeasure();
      }
    });
    return wrapper;
  }
  override updateDOM(
    dom: HTMLElement,
    _view: EditorView,
    previous: this,
  ): boolean {
    if (this.context !== previous.context) {
      return false;
    }
    if (this.hidden || previous.hidden) {
      return this.hidden === previous.hidden;
    }
    return (
      !!dom.firstElementChild &&
      reconcileProperties(
        dom.firstElementChild as HTMLElement,
        this.source,
        this.context,
      )
    );
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
    return propertiesEstimatedHeight({
      source: this.source,
      hidden: this.hidden,
      collapsed: this.context.propertyEditor?.collapsed?.() ?? false,
      allowEmpty: this.allowEmpty,
      ...(this.context.propertyEditor?.types
        ? { types: this.context.propertyEditor.types() }
        : {}),
      ...(this.context.renderProperty
        ? { renderValue: this.context.renderProperty }
        : {}),
    });
  }
}
