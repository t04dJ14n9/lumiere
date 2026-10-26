import { defaultKeymap } from "@codemirror/commands";
import {
  Compartment,
  EditorState,
  Prec,
  findClusterBreak,
} from "@codemirror/state";
import type { CodeMirror } from "@replit/codemirror-vim";
import type { Transaction } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import type { Cell, CellPosition, Table } from "../../markdown/tables/model";
import { difference } from "../../shared/document/wire";
import type { InputGrouping } from "../document/api";
import { editGroup } from "../document/api";
import { CellSource, cellSyntax } from "./cell-source";
import type { Action, TableEnvironment } from "./environment";
import { cellNavKey, cellNavigation, type CellStep } from "./navigation";
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
        selection: initialCellSelection(
          cell.text,
          selection,
          isNormalVimMode(options.vim, options.environment, options.outer),
        ),
        extensions: [
          options.environment.language,
          cellSyntax,
          cellNavigation(
            (step, extend) => options.arrow(step, extend),
            (view) => options.environment.vim?.mode(view),
          ),
          this.groups.extension,
          cellKeymap(options),
          // Nested cells are not `.mw-editor`, so stock drawSelection stays
          // visible (outer CSS only hides the note-level selection layer).
          drawSelection(),
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
    if (!this.vimEnabled || !this.environment.vim) {
      return;
    }
    const view = this.view;
    const outer = this.outer;
    const environment = this.environment;
    const word = this.word;
    const documentLine = this.documentLine;
    let cancelled = false;
    this.unbindMode = () => {
      cancelled = true;
    };
    const attach = (inner: CodeMirror | null | undefined): void => {
      if (cancelled || !inner?.state.vim) {
        return;
      }
      environment.vim?.sync(outer, view);
      const sync = (): void => environment.vim?.sync(view, outer);
      inner.on("vim-mode-change", sync);
      const words = installCellWordNavigation(view, inner, word, documentLine);
      this.unbindMode = () => {
        words.destroy();
        inner.off("vim-mode-change", sync);
      };
    };
    const immediate = environment.vim?.cm?.(view) as CodeMirror | undefined;
    if (immediate) {
      attach(immediate);
      return;
    }
    // Fallback when a custom environment omits synchronous cm(view).
    void import("@replit/codemirror-vim").then(({ getCM }) => {
      attach(getCM(view));
    });
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
  // Tab / Enter must use DOM handlers (like cellNavigation arrows): Vim's
  // normal-mode keydown swallows keymap Tab/Enter before Prec.highest keymaps
  // run (BH-039). Insert-mode and Vim-off already reached the keymap path.
  return Prec.highest([
    EditorView.domEventHandlers({
      keydown(event, view) {
        const nav = cellNavKey(event);
        if (!nav) {
          return false;
        }
        if (nav === "br") {
          view.dispatch(view.state.replaceSelection("<br>"));
        } else if (!options.move(nav.row, nav.column)) {
          return false;
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    }),
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
    ]),
  ]);
}

function isNormalVimMode(
  vimEnabled: boolean,
  environment: TableEnvironment,
  outer: EditorView,
): boolean {
  if (!vimEnabled) {
    return false;
  }
  const mode = environment.vim?.mode(outer);
  return !mode || (!mode.insertMode && !mode.visualMode);
}

export function initialCellSelection(
  text: string,
  selection: number | "all" | undefined,
  normalVim: boolean,
): { anchor: number; head: number } {
  if (normalVim) {
    if (selection === "all" || text.length === 0) {
      return { anchor: 0, head: 0 };
    }
    const fallback = findClusterBreak(text, text.length, false);
    const head = Math.max(0, Math.min(selection ?? fallback, text.length));
    return { anchor: head, head };
  }
  const anchor = selection === "all" ? 0 : (selection ?? text.length);
  const head = selection === "all" ? text.length : (selection ?? text.length);
  return { anchor, head };
}
