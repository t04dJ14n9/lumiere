import { EditorState, Transaction } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

import { editGroup } from "./input-annotation";

/** Group transport batches by the user's edit, while keeping native history authoritative. */
export class InputGroups {
  constructor(
    private readonly vimMode: (
      view: EditorView,
    ) => { insertMode?: boolean } | undefined = () => undefined,
  ) {}
  private view?: EditorView;
  private sequence = 0;
  private previous?: { time: number; ranges: { from: number; to: number }[] };
  private readonly events = new AbortController();

  readonly extension = EditorState.transactionExtender.of((transaction) => {
    if (
      transaction.annotation(Transaction.remote) ||
      transaction.annotation(editGroup) !== undefined
    ) {
      if (transaction.docChanged) {
        this.boundary();
      }
      return null;
    }
    if (!transaction.docChanged) {
      if (
        transaction.selection &&
        !transaction.selection.eq(transaction.startState.selection)
      ) {
        this.boundary();
      }
      return null;
    }
    if (!this.view?.hasFocus) {
      return null;
    }
    if (this.vimMode(this.view)) {
      return { annotations: editGroup.of(`vim-${this.sequence}`) };
    }
    return this.plainInput(transaction);
  });

  private plainInput(transaction: Transaction) {
    const time = transaction.annotation(Transaction.time)!;
    const event = transaction.annotation(Transaction.userEvent);
    const ranges: { from: number; to: number }[] = [];
    let adjacent = false;
    transaction.changes.iterChangedRanges((from, to, nextFrom, nextTo) => {
      adjacent ||=
        this.previous?.ranges.some(
          (range) => from <= range.to && to >= range.from,
        ) ?? false;
      ranges.push({ from: nextFrom, to: nextTo });
    });
    const continuous =
      this.previous &&
      (event === "input.type.compose" ||
        ((!event || /^(input\.type|delete)($|\.)/.test(event)) &&
          time - this.previous.time < 500 &&
          adjacent));
    if (!continuous) {
      this.sequence++;
    }
    this.previous = { time, ranges };
    return { annotations: editGroup.of(`input-${this.sequence}`) };
  }

  private boundary(): void {
    this.sequence++;
    delete this.previous;
  }

  attach(view: EditorView): void {
    this.view = view;
    const options = { capture: true, signal: this.events.signal };
    view.dom.addEventListener(
      "keydown",
      (event) => {
        const mode = this.vimMode(view);
        if (
          (mode && !mode.insertMode) ||
          /^(Arrow|Home|End|Page)/.test(event.key) ||
          (!mode && (event.metaKey || event.ctrlKey))
        ) {
          this.boundary();
        }
      },
      options,
    );
    view.dom.addEventListener("pointerdown", () => this.boundary(), options);
    view.dom.addEventListener("focusout", () => this.boundary(), options);
  }

  dispose(): void {
    this.events.abort();
  }
}
