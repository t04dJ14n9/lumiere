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

/** Whether a pointer selection (mouse drag) is freezing reveal. */
export function isPointerSelecting(state: EditorState): boolean {
  return (state.field(pointerSelection, false) ?? null) !== null;
}

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

/** How long a buttons-up mousemove must last before we treat it as a release. */
const BUTTON_UP_RELEASE_MS = 50;

/**
 * Calls `end` when a mouse gesture in `doc` ends or is cancelled: a release
 * (which may happen outside the frame and reach only the window), pointer
 * cancellation, window blur, or a sustained move with the left button up.
 * A brief buttons===0 flicker (common on remote desktop during fast drags)
 * must not thaw reveal mid-gesture. The line-number drag and the reveal
 * freeze share this so their lifecycles agree.
 */
export function onGestureEnd(
  doc: Document,
  end: () => void,
  signal: AbortSignal,
): void {
  let buttonUpTimer: ReturnType<typeof setTimeout> | undefined;
  const clearButtonUp = () => {
    if (buttonUpTimer !== undefined) {
      clearTimeout(buttonUpTimer);
      buttonUpTimer = undefined;
    }
  };
  const release = () => {
    clearButtonUp();
    end();
  };
  signal.addEventListener("abort", clearButtonUp);
  for (const target of [doc, doc.defaultView]) {
    for (const type of ["mouseup", "pointerup", "pointercancel"]) {
      target?.addEventListener(type, release, { capture: true, signal });
    }
  }
  doc.defaultView?.addEventListener("blur", release, { signal });
  doc.addEventListener(
    "mousemove",
    (event) => {
      if ((event.buttons & 1) !== 0) {
        clearButtonUp();
        return;
      }
      if (buttonUpTimer !== undefined) {
        return;
      }
      buttonUpTimer = setTimeout(release, BUTTON_UP_RELEASE_MS);
    },
    { capture: true, signal },
  );
}

/** Test helper: start or end the pointer reveal freeze. */
export function setPointerSelection(
  value: EditorSelection | null,
): ReturnType<typeof press.of> {
  return press.of(value);
}

export const pointerSelectionTracking: Extension = [
  pointerSelection,
  ViewPlugin.define((view: EditorView) => {
    const events = new AbortController();
    const doc = view.dom.ownerDocument;
    const release = () => {
      if (view.state.field(pointerSelection, false)) {
        // Usually after CodeMirror's own mouseup handling (not guaranteed:
        // pointerup can come first). The callback may outlive the tracker or
        // the extension, so it checks both.
        queueMicrotask(() => {
          if (
            !events.signal.aborted &&
            view.dom.isConnected &&
            view.state.field(pointerSelection, false)
          ) {
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
    onGestureEnd(doc, release, events.signal);
    return { destroy: () => events.abort() };
  }),
];
