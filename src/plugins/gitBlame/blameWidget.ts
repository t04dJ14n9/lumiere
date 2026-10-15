import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { GitIdentity } from "../../shared/git-blame";
import { blameField } from "./state";
import { formatBlameGhost } from "./format";

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

export class BlameEolWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  override eq(other: BlameEolWidget): boolean {
    return this.text === other.text;
  }
  override toDOM(view: EditorView): HTMLElement {
    const span = view.dom.ownerDocument.createElement("span");
    span.className = "mw-gb-eol";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function decorationsFor(state: EditorState): DecorationSet {
  const blame = state.field(blameField);
  if (!blame || blame.line > state.doc.lines) {
    return Decoration.none;
  }
  const text = formatBlameGhost(blame, state.field(blameIdentityField));
  return Decoration.set([
    Decoration.widget({
      widget: new BlameEolWidget(text),
      side: 1,
      block: false,
    }).range(state.doc.line(blame.line).to),
  ]);
}

export const blameDecorations = StateField.define<DecorationSet>({
  create: decorationsFor,
  update: (_value, transaction) => decorationsFor(transaction.state),
  provide: (field) => EditorView.decorations.from(field),
});
