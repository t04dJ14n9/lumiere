import { EditorView } from "@codemirror/view";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type { RenderBlock } from "../livePreview/api";
import type { RenderService } from "../render/api";
import { MarkdownBlock } from "../../webview/ui/markdown-widget";

/** A definition renders its body once and retains a destination for every reference. */
export class FootnoteDefinition extends MarkdownBlock {
  private readonly controls = new WeakMap<HTMLElement, AbortController>();

  constructor(
    block: RenderBlock,
    readonly note: Footnote,
    render: RenderService,
  ) {
    super({ ...block, source: note.text }, render);
  }

  override toDOM(view: EditorView): HTMLElement {
    const shell = super.toDOM(view);
    const navigation = document.createElement("nav");
    navigation.setAttribute(
      "aria-label",
      `Footnote ${this.note.label} references`,
    );
    const label = document.createElement("span");
    label.textContent = `[^${this.note.label}] `;
    navigation.append(label);
    const events = new AbortController();
    this.controls.set(shell, events);
    for (const [index, at] of this.note.references.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `↩ ${index + 1}`;
      button.setAttribute(
        "aria-label",
        `Back to footnote reference ${index + 1}`,
      );
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          const target = Math.min(at, view.state.doc.length);
          view.dispatch({
            selection: { anchor: target },
            effects: EditorView.scrollIntoView(target),
          });
          view.focus();
        },
        { signal: events.signal },
      );
      navigation.append(button);
    }
    shell.prepend(navigation);
    return shell;
  }

  override destroy(shell: HTMLElement): void {
    this.controls.get(shell)?.abort();
    this.controls.delete(shell);
    super.destroy(shell);
  }
}
