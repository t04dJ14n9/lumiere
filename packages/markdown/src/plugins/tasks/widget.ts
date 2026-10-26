import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import {
  destroyElement,
  untilDestroyed,
} from "../../webview/ui/element-lifetime";
import { taskEdit } from "./edits";
export class TaskBox extends WidgetType {
  constructor(
    readonly line: string,
    readonly checked: boolean,
    readonly status = checked ? "x" : " ",
  ) {
    super();
  }
  override eq(other: TaskBox): boolean {
    return (
      other instanceof TaskBox &&
      this.line === other.line &&
      this.checked === other.checked &&
      this.status === other.status
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.setAttribute("aria-label", "Task");
    checkbox.dataset.task = this.status;
    const events = new AbortController();
    untilDestroyed(checkbox, () => events.abort());
    // A toggle replaces this widget. Letting the native mouse press focus the
    // checkbox would then leave focus on the body when the old input is removed,
    // losing the editor's caret and exposing the browser's focus scrolling.
    // Cancelling mousedown preserves focus without cancelling checkbox activation.
    checkbox.addEventListener("mousedown", (event) => event.preventDefault(), {
      signal: events.signal,
    });
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
        if (change) {
          view.dispatch({ changes: change, userEvent: "input.task" });
        } else {
          checkbox.checked = this.checked;
        }
      },
      { signal: events.signal },
    );
    return checkbox;
  }
  override destroy(node: HTMLElement): void {
    destroyElement(node);
  }
}
