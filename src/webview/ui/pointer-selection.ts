import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import type { EditorState, Extension, SelectionRange } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { isNativeSelectableLabelTarget } from "./markdown-widget";

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
export const BUTTON_UP_RELEASE_MS = 50;

/** Cancels a pending buttons-up release without ending the gesture. */
export type GestureEndHandle = {
  cancelPending(): void;
};

/**
 * Calls `end` when a mouse gesture in `doc` ends or is cancelled: a release
 * (which may happen outside the frame and reach only the window), pointer
 * cancellation, window blur, or a sustained move with the left button up.
 * A brief buttons===0 flicker (common on remote desktop during fast drags)
 * must not thaw reveal mid-gesture. The line-number drag and the reveal
 * freeze share this so their lifecycles agree.
 *
 * When `isActive` is provided, buttons-up release is scheduled only while the
 * gesture is active (so idle hover cannot arm a timer that outlives a later
 * press). Call `cancelPending()` when a newer press starts so any in-flight
 * buttons-up timer from the previous gesture cannot fire.
 */
export function onGestureEnd(
  doc: Document,
  end: () => void,
  signal: AbortSignal,
  isActive?: () => boolean,
): GestureEndHandle {
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
      if (isActive && !isActive()) {
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
  return { cancelPending: clearButtonUp };
}

/**
 * Whether a primary mousedown should start (or refresh) the reveal freeze.
 * Native Mermaid SVG label drags must not freeze: thaw dispatches a
 * transaction that runs CodeMirror `updateSelection()` and clears the
 * browser's label selection. An already-frozen field does not block: a new
 * editor-selection press must own the freeze and invalidate earlier release
 * timers rather than return solely because a previous gesture is still frozen.
 */
export function shouldStartPointerFreeze(input: {
  button: number;
  nativeSelectableLabel: boolean;
}): boolean {
  return input.button === 0 && !input.nativeSelectableLabel;
}

/**
 * Whether a deferred thaw scheduled for `scheduledGeneration` should still
 * clear the freeze. Stale callbacks from an earlier gesture (or idle time)
 * must not thaw a newer press.
 */
export function shouldApplyDeferredThaw(input: {
  scheduledGeneration: number;
  currentGeneration: number;
  stillFrozen: boolean;
  aborted: boolean;
  connected: boolean;
}): boolean {
  return (
    !input.aborted &&
    input.connected &&
    input.stillFrozen &&
    input.scheduledGeneration === input.currentGeneration
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
    // Each primary editor-selection press owns a generation. Buttons-up and
    // deferred-thaw callbacks capture it and no-op if a newer press has begun.
    let gestureGeneration = 0;
    // pointerup can fire before mouseup in the same turn; a microtask would
    // thaw (and possibly reveal/destroy the widget) before click-to-edit's
    // mouseup. setTimeout(0) runs after that mouseup.
    let thawTimer: ReturnType<typeof setTimeout> | undefined;
    const clearThaw = () => {
      if (thawTimer !== undefined) {
        clearTimeout(thawTimer);
        thawTimer = undefined;
      }
    };
    events.signal.addEventListener("abort", clearThaw);
    const release = () => {
      if (
        !view.state.field(pointerSelection, false) ||
        thawTimer !== undefined
      ) {
        return;
      }
      const scheduledGeneration = gestureGeneration;
      thawTimer = setTimeout(() => {
        thawTimer = undefined;
        if (
          !shouldApplyDeferredThaw({
            scheduledGeneration,
            currentGeneration: gestureGeneration,
            stillFrozen: Boolean(view.state.field(pointerSelection, false)),
            aborted: events.signal.aborted,
            connected: view.dom.isConnected,
          })
        ) {
          return;
        }
        view.dispatch({ effects: press.of(null) });
      }, 0);
    };
    const gestureEnd = onGestureEnd(doc, release, events.signal, () =>
      isPointerSelecting(view.state),
    );
    view.dom.addEventListener(
      "mousedown",
      (event) => {
        if (
          !shouldStartPointerFreeze({
            button: event.button,
            nativeSelectableLabel: isNativeSelectableLabelTarget(event.target),
          })
        ) {
          return;
        }
        // Invalidate idle buttons-up and deferred thaw from an earlier gesture
        // before this press takes ownership of the freeze.
        gestureEnd.cancelPending();
        clearThaw();
        gestureGeneration += 1;
        view.dispatch({ effects: press.of(view.state.selection) });
      },
      { capture: true, signal: events.signal },
    );
    return { destroy: () => events.abort() };
  }),
];
