import { EditorSelection } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { BlockInfo, EditorView, ViewUpdate } from "@codemirror/view";

/**
 * Line-number selections, as in VS Code: a real selection over whole lines
 * including the last line's break, so the caret lands at the start of the
 * next line and every command (copy, cut, typing, delete, undo, Vim, IME)
 * treats it as ordinary text. Nothing on the next line is drawn or revealed:
 * the selection layer draws no zero-width part there, and Live Preview's
 * reveal test ignores a range that ends exactly at a line start.
 */
export interface LineRange {
  from: number;
  to: number;
}

/** The start of the line after `pos`'s line, or the document end. */
function after(state: EditorState, pos: number): number {
  const line = state.doc.lineAt(pos);
  return line.number < state.doc.lines
    ? line.to + state.lineBreak.length
    : line.to;
}

/**
 * Whole lines from the anchor block to the head block. Dragging down puts
 * the head after the head block's break; dragging up puts it at the start of
 * the head block and keeps the anchor block whole (its break included).
 */
export function lineSelectionFor(
  state: EditorState,
  anchor: LineRange,
  head: LineRange,
): EditorSelection {
  const start = (pos: number) => state.doc.lineAt(pos).from;
  return head.from >= anchor.from
    ? EditorSelection.single(start(anchor.from), after(state, head.to))
    : EditorSelection.single(after(state, anchor.to), start(head.from));
}

/** The lines a selection made from the line numbers covers. */
function anchorLines(state: EditorState): LineRange {
  const { anchor, head } = state.selection.main;
  let line = state.doc.lineAt(anchor);
  // An upward line selection's anchor is the start of the line after it.
  if (anchor > head && anchor === line.from && line.number > 1) {
    line = state.doc.line(line.number - 1);
  }
  return { from: line.from, to: line.to };
}

class Gesture {
  private anchor: LineRange | null = null;
  private readonly events = new AbortController();
  private drag: AbortController | null = null;

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate): void {
    if (this.anchor && update.docChanged) {
      // An edit during the drag (a remote change, say) moves the anchor.
      this.anchor = {
        from: update.changes.mapPos(this.anchor.from, -1),
        to: update.changes.mapPos(this.anchor.to, 1),
      };
    }
  }

  start(block: BlockInfo, event: MouseEvent): boolean {
    if (event.button !== 0) {
      return false;
    }
    // Without this the browser starts a native selection in the gutter.
    event.preventDefault();
    const view = this.view;
    view.focus();
    this.anchor = event.shiftKey ? anchorLines(view.state) : block;
    this.select(block);
    this.drag?.abort();
    const drag = new AbortController();
    this.drag = drag;
    const signal = AbortSignal.any([drag.signal, this.events.signal]);
    const doc = view.dom.ownerDocument;
    const stop = () => {
      drag.abort();
      this.anchor = null;
    };
    doc.addEventListener(
      "mousemove",
      (next) => {
        if ((next.buttons & 1) === 0) {
          stop();
          return;
        }
        this.select(view.lineBlockAtHeight(next.clientY - view.documentTop));
      },
      { signal },
    );
    doc.addEventListener("mouseup", stop, { signal });
    return true;
  }

  private select(head: LineRange): void {
    if (!this.anchor) {
      return;
    }
    this.view.dispatch({
      selection: lineSelectionFor(this.view.state, this.anchor, head),
      userEvent: "select.pointer",
      scrollIntoView: false,
    });
  }

  destroy(): void {
    this.events.abort();
    this.anchor = null;
  }
}

const gesture = ViewPlugin.fromClass(Gesture);

export const lineSelection: Extension = gesture;

/** Click, drag and shift+click on a line number. */
export function startLineSelection(
  view: EditorView,
  block: BlockInfo,
  event: Event,
): boolean {
  return view.plugin(gesture)?.start(block, event as MouseEvent) ?? false;
}
