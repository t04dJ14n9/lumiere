import { StateEffect, StateField } from "@codemirror/state";
import type { GitBlameOk } from "../../shared/git-blame";
import { shouldInvalidateCaret } from "./epoch";

export const setBlame = StateEffect.define<GitBlameOk | null>();
export const docVersionField = StateField.define<number>({
  create: () => 0,
  update: (version, transaction) => version + Number(transaction.docChanged),
});

/** Clear in the transaction itself; a ViewPlugin cannot dispatch during update. */
export const blameField = StateField.define<GitBlameOk | null>({
  create: () => null,
  update(value, transaction) {
    const previous = transaction.startState;
    const current = transaction.state;
    if (
      transaction.docChanged ||
      shouldInvalidateCaret(
        previous.doc.lineAt(previous.selection.main.head).number,
        current.doc.lineAt(current.selection.main.head).number,
      )
    ) {
      return null;
    }
    for (const effect of transaction.effects) {
      if (effect.is(setBlame)) {
        value = effect.value;
      }
    }
    return value;
  },
});
