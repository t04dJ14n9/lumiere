import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Extension, SelectionRange } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";

/**
 * Obsidian keeps a note rendered while the mouse button is down and reveals
 * the source under the selection on release. While a pointer selection is in
 * progress this field holds the selection from before the press, and every
 * reveal test reads it instead of the live selection; CodeMirror still draws
 * the live selection.
 */
const press = StateEffect.define<EditorSelection | null>();

export const pointerSelection = StateField.define<EditorSelection | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(press)) {
        return effect.value;
      }
    }
    return value && tr.docChanged ? value.map(tr.changes) : value;
  },
});

/** Whether `tr` starts or ends a pointer selection. */
export function pointerSelectionToggled(
  startState: EditorState,
  state: EditorState,
): boolean {
  return (
    ((startState.field(pointerSelection, false) ?? null) === null) !==
    ((state.field(pointerSelection, false) ?? null) === null)
  );
}

/**
 * The ranges that decide what is revealed. A non-empty range that ends
 * exactly at a line start (a whole-line selection, its break included) does
 * not touch that next line, so a fence or widget there stays rendered.
 */
export function revealRanges(state: EditorState): readonly SelectionRange[] {
  const ranges = (state.field(pointerSelection, false) ?? state.selection)
    .ranges;
  return ranges.map((range) => {
    if (range.empty || range.to !== state.doc.lineAt(range.to).from) {
      return range;
    }
    const to = range.to - 1;
    return range.head === range.to
      ? EditorSelection.range(range.from, to)
      : EditorSelection.range(to, range.from);
  });
}

export const pointerSelectionTracking: Extension = [
  pointerSelection,
  ViewPlugin.define((view: EditorView) => {
    const events = new AbortController();
    const doc = view.dom.ownerDocument;
    const release = () => {
      if (view.state.field(pointerSelection, false)) {
        // After CodeMirror's own mouseup handling has set the final selection.
        queueMicrotask(() => {
          if (view.dom.isConnected && view.state.field(pointerSelection)) {
            view.dispatch({ effects: press.of(null) });
          }
        });
      }
    };
    view.dom.addEventListener(
      "mousedown",
      (event) => {
        if (event.button !== 0 || view.state.field(pointerSelection)) {
          return;
        }
        view.dispatch({ effects: press.of(view.state.selection) });
      },
      { capture: true, signal: events.signal },
    );
    // A release outside the frame may not reach the document; the window,
    // pointerup and the next move without the button also end the drag.
    for (const target of [doc, doc.defaultView]) {
      for (const type of ["mouseup", "pointerup", "pointercancel"]) {
        target?.addEventListener(type, release, {
          capture: true,
          signal: events.signal,
        });
      }
    }
    doc.defaultView?.addEventListener("blur", release, {
      signal: events.signal,
    });
    doc.addEventListener(
      "mousemove",
      (event) => {
        if ((event.buttons & 1) === 0) {
          release();
        }
      },
      { signal: events.signal },
    );
    return { destroy: () => events.abort() };
  }),
];
