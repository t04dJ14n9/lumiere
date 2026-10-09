import { EditorView, WidgetType } from "@codemirror/view";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type { RenderPass, RenderService } from "../render/api";
/** The text a reference shows: its number in reading order, as in Obsidian. */
export function referenceText(note: Footnote): string {
  return String(note.number ?? note.label);
}

/**
 * How Live Preview shows a reference off the caret, as Obsidian 1.14 does:
 * its own source in superscript, brackets faint, label or inline text plain.
 */
export function referenceSource(note: Footnote): {
  open: string;
  text: string;
  close: string;
} {
  if (note.label) {
    return { open: "[^", text: note.label, close: "]" };
  }
  return { open: "^[", text: note.text, close: "]" };
}

/** `number` inside rendered blocks; `source` in Live Preview lines. */
export type ReferenceStyle = "number" | "source";

interface ReferenceOptions {
  style?: ReferenceStyle;
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
    this.fill(options.style ?? "number");
    this.button.setAttribute("aria-label", `Footnote ${referenceText(note)}`);
    this.preview.className = "footnote-preview";
    this.preview.hidden = true;
    this.preview.setAttribute("role", "tooltip");
    sup.classList.add("mw-footnote-ref");
    sup.replaceChildren(this.button, this.preview);
    this.registerEvents();
  }

  private fill(style: ReferenceStyle): void {
    if (style === "number") {
      this.button.textContent = referenceText(this.note);
      return;
    }
    const { open, text, close } = referenceSource(this.note);
    const bracket = (value: string) => {
      const span = document.createElement("span");
      span.className = "mw-footnote-bracket";
      span.textContent = value;
      return span;
    };
    this.button.replaceChildren(bracket(open), text, bracket(close));
    this.sup.classList.add("is-source");
  }

  private hide(): void {
    this.preview.hidden = true;
  }

  private show(): void {
    this.preview.hidden = false;
    if (this.rendered) {
      return;
    }
    this.rendered = true;
    void this.options.render
      .into(this.preview, this.note.text, {
        ancestry: ["footnote-preview"],
        measure: this.options.measure,
      })
      .then((result) => {
        this.pass = result;
        if (!this.active) {
          void result.dispose();
        }
      })
      .catch(() => {
        if (this.active) {
          this.preview.textContent = this.note.text;
        }
      });
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
    readonly style: ReferenceStyle = "number",
  ) {
    super();
  }
  override eq(other: FootnoteReference): boolean {
    return (
      other instanceof FootnoteReference &&
      this.note.text === other.note.text &&
      this.note.label === other.note.label &&
      this.note.number === other.note.number &&
      this.style === other.style &&
      this.note.from === other.note.from
    );
  }
  override toDOM(view: EditorView): HTMLElement {
    const sup = document.createElement("sup");
    this.cleanups.set(
      sup,
      mountReference(sup, this.note, {
        style: this.style,
        render: this.render,
        navigate: () => {
          view.dispatch({
            selection: { anchor: this.note.from },
            effects: EditorView.scrollIntoView(this.note.from),
          });
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
