import { redo as cmRedo, undo as cmUndo } from "@codemirror/commands";
import {
  EditorSelection,
  StateField,
  type ChangeSpec,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface EditorPosition {
  line: number;
  ch: number;
}

export interface EditorRange {
  from: EditorPosition;
  to: EditorPosition;
}

export interface EditorSelectionOrCaret {
  anchor: EditorPosition;
  head?: EditorPosition;
}

export interface EditorChange extends EditorRange {
  text: string;
}

export interface EditorTransaction {
  replaceSelection?: string;
  changes?: EditorChange[];
  selections?: EditorRange[];
  selection?: { from: EditorPosition; to?: EditorPosition };
}

export const editorViewField = StateField.define<EditorView | null>({
  create: () => null,
  update: (value) => value,
});

export const editorInfoField = StateField.define<unknown>({
  create: () => null,
  update: (value) => value,
});

export const editorEditorField = StateField.define<Editor | null>({
  create: () => null,
  update: (value) => value,
});

export const editorLivePreviewField = StateField.define<boolean>({
  create: () => true,
  update: (value) => value,
});

export const livePreviewState = editorLivePreviewField;

export class Editor {
  private viewProvider: () => EditorView;

  constructor(viewOrProvider: EditorView | (() => EditorView)) {
    this.viewProvider =
      typeof viewOrProvider === "function"
        ? viewOrProvider
        : () => viewOrProvider;
  }

  get cm(): EditorView {
    return this.viewProvider();
  }

  setViewProvider(provider: () => EditorView): void {
    this.viewProvider = provider;
  }

  getDoc(): this {
    return this;
  }

  refresh(): void {}

  getValue(): string {
    return this.cm.state.doc.toString();
  }

  setValue(content: string): void {
    const doc = this.cm.state.doc;
    this.cm.dispatch({
      changes: { from: 0, to: doc.length, insert: String(content ?? "") },
    });
  }

  getLine(line: number): string {
    const doc = this.cm.state.doc;
    const lineNum = line + 1;
    if (lineNum < 1 || lineNum > doc.lines) {
      return "";
    }
    return doc.line(lineNum).text;
  }

  setLine(n: number, text: string): void {
    const doc = this.cm.state.doc;
    const lineNum = n + 1;
    if (lineNum < 1 || lineNum > doc.lines) {
      return;
    }
    const lineObj = doc.line(lineNum);
    this.cm.dispatch({
      changes: {
        from: lineObj.from,
        to: lineObj.to,
        insert: String(text ?? ""),
      },
    });
  }

  lineCount(): number {
    return this.cm.state.doc.lines;
  }

  lastLine(): number {
    return Math.max(0, this.cm.state.doc.lines - 1);
  }

  posToOffset(pos: EditorPosition): number {
    const doc = this.cm.state.doc;
    if (doc.lines === 0) {
      return 0;
    }
    const clampedLine = Math.max(
      1,
      Math.min(doc.lines, Math.trunc(pos.line) + 1),
    );
    const lineObj = doc.line(clampedLine);
    const ch = Math.max(0, Math.min(lineObj.length, Math.trunc(pos.ch)));
    return lineObj.from + ch;
  }

  offsetToPos(offset: number): EditorPosition {
    const doc = this.cm.state.doc;
    const clamped = Math.max(0, Math.min(doc.length, Math.trunc(offset)));
    const lineObj = doc.lineAt(clamped);
    return {
      line: lineObj.number - 1,
      ch: clamped - lineObj.from,
    };
  }

  getCursor(side: "from" | "to" | "head" | "anchor" = "head"): EditorPosition {
    const main = this.cm.state.selection.main;
    switch (side) {
      case "from":
        return this.offsetToPos(main.from);
      case "to":
        return this.offsetToPos(main.to);
      case "anchor":
        return this.offsetToPos(main.anchor);
      case "head":
      default:
        return this.offsetToPos(main.head);
    }
  }

  setCursor(pos: EditorPosition | number, ch?: number): void {
    const target: EditorPosition =
      typeof pos === "number" ? { line: pos, ch: ch ?? 0 } : pos;
    const offset = this.posToOffset(target);
    this.cm.dispatch({
      selection: { anchor: offset, head: offset },
    });
  }

  listSelections(): Array<{ anchor: EditorPosition; head: EditorPosition }> {
    return this.cm.state.selection.ranges.map((range) => ({
      anchor: this.offsetToPos(range.anchor),
      head: this.offsetToPos(range.head),
    }));
  }

  setSelection(anchor: EditorPosition, head?: EditorPosition): void {
    const anchorOffset = this.posToOffset(anchor);
    const headOffset = head ? this.posToOffset(head) : anchorOffset;
    this.cm.dispatch({
      selection: { anchor: anchorOffset, head: headOffset },
    });
  }

  setSelections(ranges: readonly EditorSelectionOrCaret[], main = 0): void {
    if (ranges.length === 0) {
      return;
    }
    const cmRanges = ranges.map((r) => {
      const anchor = this.posToOffset(r.anchor);
      const head = r.head ? this.posToOffset(r.head) : anchor;
      return EditorSelection.range(anchor, head);
    });
    this.cm.dispatch({
      selection: EditorSelection.create(
        cmRanges,
        Math.max(0, Math.min(cmRanges.length - 1, main)),
      ),
    });
  }

  getSelection(): string {
    const state = this.cm.state;
    const main = state.selection.main;
    return state.sliceDoc(main.from, main.to);
  }

  somethingSelected(): boolean {
    return this.cm.state.selection.ranges.some((r) => !r.empty);
  }

  replaceSelection(replacement: string, _origin?: string): void {
    const spec = this.cm.state.replaceSelection(String(replacement ?? ""));
    this.cm.dispatch(spec);
  }

  replaceRange(
    replacement: string,
    from: EditorPosition,
    to?: EditorPosition,
    _origin?: string,
  ): void {
    const fromOffset = this.posToOffset(from);
    const toOffset = to ? this.posToOffset(to) : fromOffset;
    this.cm.dispatch({
      changes: {
        from: Math.min(fromOffset, toOffset),
        to: Math.max(fromOffset, toOffset),
        insert: String(replacement ?? ""),
      },
    });
  }

  getRange(from: EditorPosition, to: EditorPosition): string {
    const a = this.posToOffset(from);
    const b = this.posToOffset(to);
    return this.cm.state.sliceDoc(Math.min(a, b), Math.max(a, b));
  }

  transaction(tx: EditorTransaction, _origin?: string): void {
    if (tx.replaceSelection !== undefined) {
      this.replaceSelection(tx.replaceSelection);
      return;
    }
    const changes: ChangeSpec[] = [];
    if (tx.changes) {
      for (const change of tx.changes) {
        const from = this.posToOffset(change.from);
        const to = change.to ? this.posToOffset(change.to) : from;
        changes.push({
          from: Math.min(from, to),
          to: Math.max(from, to),
          insert: change.text,
        });
      }
    }
    const spec: TransactionSpec = {};
    if (changes.length > 0) {
      spec.changes = changes;
    }
    if (tx.selection) {
      const from = this.posToOffset(tx.selection.from);
      const to = tx.selection.to ? this.posToOffset(tx.selection.to) : from;
      spec.selection = { anchor: from, head: to };
    } else if (tx.selections && tx.selections.length > 0) {
      spec.selection = EditorSelection.create(
        tx.selections.map((s) =>
          EditorSelection.range(
            this.posToOffset(s.from),
            this.posToOffset(s.to),
          ),
        ),
      );
    }
    this.cm.dispatch(spec);
  }

  wordAt(pos: EditorPosition): EditorRange | null {
    const offset = this.posToOffset(pos);
    const word = this.cm.state.wordAt(offset);
    if (!word) {
      return null;
    }
    return {
      from: this.offsetToPos(word.from),
      to: this.offsetToPos(word.to),
    };
  }

  focus(): void {
    this.cm.focus();
  }

  blur(): void {
    this.cm.contentDOM?.blur?.();
  }

  hasFocus(): boolean {
    return this.cm.hasFocus;
  }

  getScrollInfo(): { top: number; left: number } {
    return {
      top: this.cm.scrollDOM?.scrollTop ?? 0,
      left: this.cm.scrollDOM?.scrollLeft ?? 0,
    };
  }

  scrollTo(x?: number | null, y?: number | null): void {
    if (!this.cm.scrollDOM) {
      return;
    }
    if (typeof x === "number") {
      this.cm.scrollDOM.scrollLeft = x;
    }
    if (typeof y === "number") {
      this.cm.scrollDOM.scrollTop = y;
    }
  }

  scrollIntoView(range: EditorRange, center?: boolean): void {
    const from = this.posToOffset(range.from);
    this.cm.dispatch({
      effects: EditorView.scrollIntoView(from, {
        y: center ? "center" : "nearest",
      }),
    });
  }

  undo(): void {
    cmUndo(this.cm);
  }

  redo(): void {
    cmRedo(this.cm);
  }

  exec(command: string): void {
    if (command === "undo") {
      this.undo();
    } else if (command === "redo") {
      this.redo();
    }
  }
}
