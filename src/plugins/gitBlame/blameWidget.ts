import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { GitIdentity } from "../../shared/git-blame";
import { placePreview } from "../footnotes/preview-position";
import { blameField } from "./state";
import { formatBlameGhost, formatBlameTooltip } from "./format";
import { canPaintBlameAt } from "./paintable";

export const setBlameIdentity = StateEffect.define<GitIdentity | undefined>();
export const blameIdentityField = StateField.define<GitIdentity | undefined>({
  create: () => undefined,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setBlameIdentity)) {
        value = effect.value;
      }
    }
    return value;
  },
});

/** DOM-scoped: CodeMirror reuses equal-widget DOM across instances. */
const blameTooltipCleanups = new WeakMap<HTMLElement, () => void>();

export class BlameEolWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly tooltip: string,
  ) {
    super();
  }
  override eq(other: BlameEolWidget): boolean {
    return this.text === other.text && this.tooltip === other.tooltip;
  }
  override toDOM(view: EditorView): HTMLElement {
    const span = view.dom.ownerDocument.createElement("span");
    span.className = "mw-gb-eol";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    if (this.tooltip) {
      blameTooltipCleanups.set(span, mountBlameTooltip(span, this.tooltip));
    }
    return span;
  }
  override destroy(dom: HTMLElement): void {
    blameTooltipCleanups.get(dom)?.();
    blameTooltipCleanups.delete(dom);
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function mountBlameTooltip(host: HTMLElement, text: string): () => void {
  const doc = host.ownerDocument;
  const tip = doc.createElement("div");
  tip.className = "mw-gb-tooltip";
  tip.hidden = true;
  tip.setAttribute("role", "tooltip");
  tip.setAttribute("data-mw-selection-ignore", "");
  tip.textContent = text;
  doc.documentElement.append(tip);
  const events = new AbortController();
  const options = { signal: events.signal };
  const fit = (): void => {
    if (tip.hidden) {
      return;
    }
    const root = doc.documentElement;
    const box = tip.getBoundingClientRect();
    const { left, top, isAbove } = placePreview(
      { width: box.width, height: box.height },
      host.getBoundingClientRect(),
      { width: root.clientWidth, height: root.clientHeight },
    );
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.classList.toggle("is-above", isAbove);
  };
  const show = (): void => {
    tip.hidden = false;
    fit();
  };
  const hide = (): void => {
    tip.hidden = true;
  };
  host.addEventListener("mouseenter", show, options);
  host.addEventListener("mouseleave", hide, options);
  // Keep the tooltip while the pointer crosses the gap into it.
  tip.addEventListener("mouseenter", show, options);
  tip.addEventListener("mouseleave", hide, options);
  return () => {
    events.abort();
    tip.remove();
  };
}

function decorationsFor(state: EditorState): DecorationSet {
  const blame = state.field(blameField);
  if (!blame || blame.line > state.doc.lines) {
    return Decoration.none;
  }
  const anchor = state.doc.line(blame.line).to;
  if (!canPaintBlameAt(state, anchor)) {
    return Decoration.none;
  }
  const identity = state.field(blameIdentityField);
  const text = formatBlameGhost(blame, identity);
  const tooltip = formatBlameTooltip(blame, identity);
  return Decoration.set([
    Decoration.widget({
      widget: new BlameEolWidget(text, tooltip),
      side: 1,
      block: false,
    }).range(anchor),
  ]);
}

export const blameDecorations = StateField.define<DecorationSet>({
  create: decorationsFor,
  update: (_value, transaction) => decorationsFor(transaction.state),
  provide: (field) => EditorView.decorations.from(field),
});
