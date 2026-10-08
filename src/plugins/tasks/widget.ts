import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { taskEdit } from "./edits";
export class TaskBox extends WidgetType {
  private readonly events = new WeakMap<HTMLElement, AbortController>();
  constructor(
    readonly line: string,
    readonly checked: boolean,
  ) {
    super();
  }
  override eq(other: TaskBox): boolean {
    return (
      other instanceof TaskBox &&
      this.line === other.line &&
      this.checked === other.checked
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.setAttribute("aria-label", "Task");
    const events = new AbortController();
    this.events.set(checkbox, events);
    checkbox.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        const line = view.state.doc.lineAt(view.posAtDOM(checkbox)).number - 1;
        const change = taskEdit(
          view.state.doc.toString(),
          line,
          this.line,
          checkbox.checked,
        );
        if (change) view.dispatch({ changes: change, userEvent: "input.task" });
        else checkbox.checked = this.checked;
      },
      { signal: events.signal },
    );
    return checkbox;
  }
  override destroy(node: HTMLElement): void {
    this.events.get(node)?.abort();
    this.events.delete(node);
  }
}
