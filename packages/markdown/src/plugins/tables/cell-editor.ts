import { defaultKeymap } from "@codemirror/commands";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import type { Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import type { Cell, CellPosition, Table } from "../../markdown/tables/model";
import { difference } from "../../shared/document/wire";
import type { InputGrouping } from "../document/api";
import { editGroup } from "../document/api";
import { CellSource, cellSyntax } from "./cell-source";
import type { Action, TableEnvironment } from "./environment";
import { cellNavigation, type CellStep } from "./navigation";
import { installCellWordNavigation } from "./word-navigation";
import type { WordMotion } from "./word-motion";

interface CellEditorOptions {
  parent: HTMLElement;
  cell: Cell;
  position: CellPosition;
  selection?: number | "all";
  environment: TableEnvironment;
  vim: boolean;
  outer: EditorView;
  change(text: string, group: string): void;
  /** The cell's caret or text changed: the document's caret follows it. */
  caret(): void;
  selected(selected: boolean): void;
  action(action: Action): boolean;
  move(row: number, column: number): boolean;
  arrow(step: CellStep, extend: boolean): boolean;
  word(motion: WordMotion, count: number): boolean;
  documentLine(line: number | "last"): boolean;
}

let session = 0;

/** A temporary cell view; all edits and history belong to the host document. */
export class CellEditor {
  readonly view: EditorView;
  readonly source: CellSource;
  private readonly vim = new Compartment();
  private readonly groups: InputGrouping;
  private vimEnabled: boolean;
  private reconciling = false;
  private readonly outer: EditorView;
  private readonly environment: TableEnvironment;
  private unbindMode?: () => void;
  private readonly word: CellEditorOptions["word"];
  private readonly documentLine: CellEditorOptions["documentLine"];

  constructor(options: CellEditorOptions) {
    const { cell, selection } = options;
    this.environment = options.environment;
    this.word = options.word;
    this.documentLine = options.documentLine;
    this.groups = options.environment.inputGroups();
    this.source = new CellSource(cell);
    this.vimEnabled = options.vim;
    this.outer = options.outer;
    const groupPrefix = `cell-${++session}`;
    this.view = new EditorView({
      parent: options.parent,
      dispatchTransactions: (transactions, view) => {
        view.update(transactions);
        if (!this.reconciling) {
          this.report(transactions, options, groupPrefix);
        }
      },
      state: EditorState.create({
        doc: cell.text,
        selection: {
          anchor: selection === "all" ? 0 : (selection ?? cell.text.length),
          head:
            selection === "all"
              ? cell.text.length
              : (selection ?? cell.text.length),
        },
        extensions: [
          options.environment.language,
          cellSyntax,
          cellNavigation((step, extend) => options.arrow(step, extend)),
          this.groups.extension,
          cellKeymap(options),
          // Table navigation gets the first chance at a cell boundary.
          this.vim.of(
            options.vim ? (this.environment.vim?.extension() ?? []) : [],
          ),
          keymap.of(defaultKeymap),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet) {
              options.selected(!update.state.selection.main.empty);
            }
          }),
        ],
      }),
    });
    this.label(options.position);
    this.groups.attach(this.view);
    this.bindMode();
  }

  /** Edits go to the document, and its caret follows the cell's. */
  private report(
    transactions: readonly Transaction[],
    options: CellEditorOptions,
    groupPrefix: string,
  ): void {
    if (transactions.some((transaction) => transaction.docChanged)) {
      options.change(
        this.view.state.doc.toString(),
        `${groupPrefix}/${transactions.at(-1)?.annotation(editGroup) ?? "input"}`,
      );
    }
    if (
      transactions.some(
        (transaction) => transaction.docChanged || transaction.selection,
      )
    ) {
      options.caret();
    }
  }

  private bindMode(): void {
    this.unbindMode?.();
    delete this.unbindMode;
    const inner = getCM(this.view);
    if (!inner?.state.vim) {
      return;
    }
    this.environment.vim?.sync(this.outer, this.view);
    const sync = (): void => this.environment.vim?.sync(this.view, this.outer);
    inner.on("vim-mode-change", sync);
    const words = installCellWordNavigation(
      this.view,
      inner,
      this.word,
      this.documentLine,
    );
    this.unbindMode = () => {
      words.destroy();
      inner.off("vim-mode-change", sync);
    };
  }

  label(position: CellPosition): void {
    this.view.contentDOM.setAttribute(
      "aria-label",
      `Table cell ${position.row + 1}, ${position.column + 1}`,
    );
  }

  update(
    source: string,
    cell: Cell,
    vim: boolean,
    alignment: Table["alignments"][number],
  ): void {
    const { from, to } = this.source.range(source, cell, alignment);
    const text = source.slice(from, to);
    this.reconciling = true;
    try {
      if (this.view.state.doc.toString() !== text) {
        this.view.dispatch({
          changes: difference(this.view.state.doc.toString(), text),
        });
      }
      if (this.vimEnabled !== vim) {
        this.unbindMode?.();
        delete this.unbindMode;
        this.vimEnabled = vim;
        this.view.dispatch({
          effects: this.vim.reconfigure(
            vim ? (this.environment.vim?.extension() ?? []) : [],
          ),
        });
        this.bindMode();
      }
    } finally {
      this.reconciling = false;
    }
  }

  /** Keep the adapter alive so a mapping or macro can continue in the next cell. */
  retarget(cell: Cell, position: CellPosition, head: number): void {
    this.reconciling = true;
    try {
      this.source.remember(cell.text);
      this.label(position);
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: cell.text },
        selection: { anchor: head },
      });
    } finally {
      this.reconciling = false;
    }
  }

  destroy(): void {
    this.unbindMode?.();
    this.view.destroy();
    this.groups.dispose();
  }
}

export function cellKeymap(options: CellEditorOptions) {
  return Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        run: (view) => options.environment.links?.follow(view) ?? false,
      },
      {
        key: "Mod-s",
        run: () => options.action("save"),
        stopPropagation: true,
      },
      {
        key: "Mod-z",
        run: () => options.action("undo"),
        stopPropagation: true,
      },
      {
        key: "Mod-Shift-z",
        run: () => options.action("redo"),
        stopPropagation: true,
      },
      {
        key: "Mod-b",
        run: (view) => options.environment.wrap("**", view),
        stopPropagation: true,
      },
      {
        key: "Mod-i",
        run: (view) => options.environment.wrap("*", view),
        stopPropagation: true,
      },
      { key: "Tab", run: () => options.move(0, 1) },
      { key: "Shift-Tab", run: () => options.move(0, -1) },
      { key: "Enter", run: () => options.move(1, 0) },
      {
        key: "Shift-Enter",
        run: (view) => {
          view.dispatch(view.state.replaceSelection("<br>"));
          return true;
        },
      },
    ]),
  );
}
