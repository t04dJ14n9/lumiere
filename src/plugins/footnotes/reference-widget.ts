import { EditorView, WidgetType } from "@codemirror/view";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type { RenderPass, RenderService } from "../render/api";
import { fitPreview } from "./preview-position";
/**
 * The text a reference shows: its number in order of first reference, as
 * in a LaTeX paper. Named labels are numbered too.
 */
export function referenceText(note: Footnote): string {
  return String(note.number ?? note.label);
}

interface ReferenceOptions {
  render: RenderService;
  navigate(): void;
  measure(): void;
}

/** Both inline widgets and references inside rendered blocks use this control. */
export function mountReference(
  sup: HTMLElement,
  note: Footnote,
  options: ReferenceOptions,
): () => void {
  const reference = new ReferenceControl(sup, note, options);
  return () => reference.dispose();
}

class ReferenceControl {
  private readonly events = new AbortController();
  private readonly button = document.createElement("button");
  private readonly preview = document.createElement("span");
  private active = true;
  private rendered = false;
  private pass?: RenderPass;

  constructor(
    private readonly sup: HTMLElement,
    private readonly note: Footnote,
    private readonly options: ReferenceOptions,
  ) {
    this.button.type = "button";
    this.button.textContent = referenceText(note);
    this.button.setAttribute("aria-label", `Footnote ${referenceText(note)}`);
    this.preview.className = "footnote-preview";
    this.preview.hidden = true;
    this.preview.setAttribute("role", "tooltip");
    // Not document text: the selection layer ignores it (with role=tooltip
    // and its absolute position, this is the explicit marker).
    this.preview.setAttribute("data-mw-selection-ignore", "");
    sup.classList.add("mw-footnote-ref");
    sup.replaceChildren(this.button, this.preview);
    this.registerEvents();
  }

  private hide(): void {
    this.preview.hidden = true;
  }

  private show(): void {
    this.preview.hidden = false;
    this.fit();
    if (this.rendered) {
      return;
    }
    this.rendered = true;
    void this.options.render
      .into(this.preview, this.note.text, {
        ancestry: ["footnote-preview"],
        measure: () => {
          this.fit();
          this.options.measure();
        },
      })
      .then((result) => {
        this.pass = result;
        if (!this.active) {
          void result.dispose();
          return;
        }
        this.fit();
      })
      .catch(() => {
        if (this.active) {
          this.preview.textContent = this.note.text;
          this.fit();
        }
      });
  }

  /** Keeps the open preview inside the webview; its size changes as it renders. */
  private fit(): void {
    if (this.preview.hidden) {
      return;
    }
    this.preview.style.translate = "";
    this.preview.classList.remove("is-above");
    const root = this.sup.ownerDocument.documentElement;
    const { shift, isAbove } = fitPreview(
      this.preview.getBoundingClientRect(),
      this.sup.getBoundingClientRect(),
      { width: root.clientWidth, height: root.clientHeight },
    );
    this.preview.style.translate = shift ? `${shift}px 0` : "";
    this.preview.classList.toggle("is-above", isAbove);
  }

  private registerEvents(): void {
    const options = { signal: this.events.signal };
    for (const event of ["mouseenter", "focusin"]) {
      this.sup.addEventListener(event, () => this.show(), options);
    }
    this.sup.addEventListener("mouseleave", () => this.hide(), options);
    this.sup.addEventListener(
      "focusout",
      (event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !this.sup.contains(event.relatedTarget)
        ) {
          this.hide();
        }
      },
      options,
    );
    this.sup.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          this.hide();
          this.button.focus();
        }
      },
      options,
    );
    this.button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.navigate();
      },
      options,
    );
  }

  dispose(): void {
    this.active = false;
    this.events.abort();
    void this.pass?.dispose();
  }
}

export class FootnoteReference extends WidgetType {
  private readonly cleanups = new WeakMap<HTMLElement, () => void>();
  constructor(
    readonly note: Footnote,
    private readonly render: RenderService,
    private readonly navigate: (jump: () => void) => void = (jump) => jump(),
  ) {
    super();
  }
  override eq(other: FootnoteReference): boolean {
    return (
      other instanceof FootnoteReference &&
      this.note.text === other.note.text &&
      this.note.label === other.note.label &&
      this.note.number === other.note.number &&
      this.note.from === other.note.from
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const sup = document.createElement("sup");
    this.cleanups.set(
      sup,
      mountReference(sup, this.note, {
        render: this.render,
        navigate: () => {
          this.navigate(() =>
            view.dispatch({
              selection: { anchor: this.note.from },
              effects: EditorView.scrollIntoView(this.note.from),
            }),
          );
          view.focus();
        },
        measure: () => view.requestMeasure(),
      }),
    );
    return sup;
  }
  override destroy(sup: HTMLElement): void {
    this.cleanups.get(sup)?.();
    this.cleanups.delete(sup);
  }
}
