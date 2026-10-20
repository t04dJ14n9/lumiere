import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { TitleInput, type TitleActions, type TitleValue } from "./input";
import { titleEstimatedHeight } from "./estimated-height";
export const setTitle = StateEffect.define<TitleValue>();
export function titleField(initial: string, actions: TitleActions) {
  const inputs = new WeakMap<HTMLElement, TitleInput>();
  class TitleWidget extends WidgetType {
    constructor(readonly value: TitleValue) {
      super();
    }
    override eq(other: TitleWidget): boolean {
      return (
        this.value.title === other.value.title &&
        this.value.error === other.value.error
      );
    }
    override updateDOM(root: HTMLElement): boolean {
      const input = inputs.get(root);
      if (!input) {
        return false;
      }
      input.update(this.value);
      return true;
    }
    override toDOM(view: EditorView): HTMLElement {
      const input = new TitleInput(view, this.value, actions);
      inputs.set(input.root, input);
      return input.root;
    }
    override destroy(root: HTMLElement): void {
      inputs.get(root)?.dispose();
      inputs.delete(root);
    }
    override ignoreEvent(): boolean {
      return true;
    }
    override get estimatedHeight(): number {
      return titleEstimatedHeight(this.value.title);
    }
  }
  return StateField.define<TitleValue>({
    create: () => ({ title: initial }),
    update(value, transaction) {
      const effect = transaction.effects.find((effect) => effect.is(setTitle));
      return effect ? effect.value : value;
    },
    provide: (field) =>
      EditorView.decorations.from(field, (value) =>
        Decoration.set([
          Decoration.widget({
            widget: new TitleWidget(value),
            block: true,
            side: -1,
          }).range(0),
        ]),
      ),
  });
}
