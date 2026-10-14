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
  override toDOM(_view: EditorView): HTMLElement {
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
    lifetimes.set(wrapper, () => {
      lists();
      controls();
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
}
