import { WidgetType } from "@codemirror/view";
export class TagWidget extends WidgetType {
  constructor(
    readonly tag: string,
    private readonly search: (tag: string) => void,
  ) {
    super();
  }
  override eq(other: TagWidget): boolean {
    return this.tag === other.tag && this.search === other.search;
  }
  override toDOM(): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "md-tag";
    button.textContent = "#" + this.tag;
    button.setAttribute("aria-label", `Search tag #${this.tag}`);
    button.onclick = () => this.search(this.tag);
    return button;
  }
  override ignoreEvent(): boolean {
    return true;
  }
  override destroy(button: HTMLElement): void {
    button.onclick = null;
  }
}
