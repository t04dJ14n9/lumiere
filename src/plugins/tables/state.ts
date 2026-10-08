import { Facet, StateEffect, StateField } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { TableController } from "./controller";
import type { Action } from "./environment";

export const revealTableSource = StateEffect.define<number | null>();
export const tableSource = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    const effect = transaction.effects.find((effect) =>
      effect.is(revealTableSource),
    );
    if (effect) {
      return effect.value;
    }
    return value === null ? null : transaction.changes.mapPos(value, 1);
  },
});

export const activeTables = new WeakMap<EditorView, TableController>();
export const tableActions = Facet.define<
  (action: Action) => void,
  (action: Action) => void
>({ combine: (values) => values[0] ?? (() => {}) });
export const tableSelectionChanges = Facet.define<
  (selected: boolean) => void,
  (selected: boolean) => void
>({ combine: (values) => values[0] ?? (() => {}) });
export function tableSelection(
  view: EditorView,
): { from: number; to: number } | undefined {
  return activeTables.get(view)?.selection();
}
export function clearTableSelection(view: EditorView): void {
  activeTables.delete(view);
}
export function activeEditor(view: EditorView): EditorView {
  return activeTables.get(view)?.editor ?? view;
}
