import { EditorView, WidgetType } from "@codemirror/view";
import type { Footnote } from "../../markdown/metadata/footnotes";
import type { RenderPass, RenderService } from "../render/api";
/** Both inline widgets and references inside rendered blocks use this control. */
export function mountReference(sup: HTMLElement, note: Footnote, render: RenderService,
  navigate: () => void, measure: () => void): () => void {
  const events = new AbortController();
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = note.label ? `[^${note.label}]` : `[${note.number}]`;
  button.setAttribute("aria-label", `Footnote ${note.label || note.number}`);
  const preview = document.createElement("span");
  preview.className = "footnote-preview";
  preview.hidden = true;
  preview.setAttribute("role", "tooltip");
  sup.classList.add("hybrid-footnote-ref");
  sup.replaceChildren(button, preview);
  let active = true;
  let rendered = false;
  let pass: RenderPass | undefined;
  const hide = () => { preview.hidden = true; };
  const show = () => {
    preview.hidden = false;
    if (rendered) return;
    rendered = true;
    void render.into(preview, note.text, { ancestry: ["footnote-preview"], measure })
      .then((result) => { pass = result; if (!active) void result.dispose(); })
      .catch(() => { if (active) preview.textContent = note.text; });
  };
  for (const event of ["mouseenter", "focusin"]) sup.addEventListener(event, show, { signal: events.signal });
  sup.addEventListener("mouseleave", hide, { signal: events.signal });
  sup.addEventListener("focusout", (event) => {
    if (!(event.relatedTarget instanceof Node) || !sup.contains(event.relatedTarget)) hide();
  }, { signal: events.signal });
  sup.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.stopPropagation(); hide(); button.focus(); }
  }, { signal: events.signal });
  button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); navigate(); }, { signal: events.signal });
  return () => { active = false; events.abort(); void pass?.dispose(); };
}
export class FootnoteReference extends WidgetType {
  private readonly cleanups = new WeakMap<HTMLElement, () => void>();
  constructor(readonly note: Footnote, private readonly render: RenderService) { super(); }
  override eq(other: FootnoteReference): boolean {
    return other instanceof FootnoteReference && this.note.text === other.note.text &&
      this.note.label === other.note.label && this.note.number === other.note.number && this.note.from === other.note.from;
  }
  override toDOM(view: EditorView): HTMLElement {
    const sup = document.createElement("sup");
    this.cleanups.set(sup, mountReference(sup, this.note, this.render, () => {
      view.dispatch({ selection: { anchor: this.note.from }, effects: EditorView.scrollIntoView(this.note.from) });
      view.focus();
    }, () => view.requestMeasure()));
    return sup;
  }
  override destroy(sup: HTMLElement): void { this.cleanups.get(sup)?.(); this.cleanups.delete(sup); }
}
