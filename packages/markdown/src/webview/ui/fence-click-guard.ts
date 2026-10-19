import { StateEffect, StateField } from "@codemirror/state";
import type { EditorSelection, Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  eventTargetInside,
  isBlockControl,
  latchClickDrag,
} from "./block-pointer";

/**
 * Whether a primary mousedown that missed the widget DOM maps into a replaced
 * fence and should arm the plain-click restore (blocks with `guardMargin`).
 * Does not decide preventDefault — CodeMirror must own mousedown for focus,
 * Shift/Cmd selection, drag-scroll, and scrollbar.
 */
export function shouldGuardFenceMouseDown(input: {
  button: number;
  onControl: boolean;
  targetInsideShell: boolean;
  pos: number | null;
  blockFrom: number;
  blockTo: number;
  modified?: boolean;
  onChrome?: boolean;
}): boolean {
  if (
    input.button !== 0 ||
    input.onControl ||
    input.targetInsideShell ||
    input.pos === null ||
    input.modified ||
    input.onChrome
  ) {
    return false;
  }
  return input.pos >= input.blockFrom && input.pos <= input.blockTo;
}

/** Active fence-guard press; restores selection only for a completed plain click. */
export type FenceGuardPress = {
  readonly x: number;
  readonly y: number;
  dragged: boolean;
  readonly selection: EditorSelection;
  /** Doc identity at mousedown; restore skips if the doc object changed. */
  readonly doc: { readonly length: number };
};

/**
 * Whether mouseup should restore the pre-press selection so a margin click does
 * not leave the caret inside the fence (which would reveal Mermaid on thaw).
 */
export function shouldRestoreFenceClick(input: {
  press: FenceGuardPress | null;
  button: number;
  modified: boolean;
}): boolean {
  return (
    input.press !== null &&
    !input.press.dragged &&
    input.button === 0 &&
    !input.modified
  );
}

/**
 * Whether this release invocation owns fenceGuardSelection clear/consume.
 * `onRelease` is registered on both window and document; the first mouseup
 * takePress() wins and queues restore. The duplicate sees null and must
 * return without clearing — otherwise the microtask reads a wiped field.
 */
export function ownsFenceGuardRelease(
  active: FenceGuardPress | null,
): active is FenceGuardPress {
  return active !== null;
}

/**
 * Selection to restore after a plain fence-margin click.
 *
 * Prefer a selection already mapped through intervening changes (the
 * `fenceGuardSelection` field, analogous to `pointerSelection`). If the
 * document object changed during the press and no mapped selection is
 * available, return null — skipping is safer than writing stale absolute
 * offsets into a concurrent edit.
 */
export function resolveFenceGuardSelection(input: {
  selection: EditorSelection;
  savedDoc: { readonly length: number };
  currentDoc: { readonly length: number };
  /** Already-mapped selection (e.g. from `fenceGuardSelection` field). */
  mapped?: EditorSelection | null;
  map?: (selection: EditorSelection) => EditorSelection;
}): EditorSelection | null {
  if (input.mapped !== undefined && input.mapped !== null) {
    return input.mapped;
  }
  if (input.savedDoc === input.currentDoc) {
    return input.selection;
  }
  if (input.map) {
    return input.map(input.selection);
  }
  return null;
}

const setFenceGuardSelection = StateEffect.define<EditorSelection | null>();

/** Test helper: arm or clear the mapped fence-restore selection. */
export function setFenceGuardSelectionEffect(
  value: EditorSelection | null,
): ReturnType<typeof setFenceGuardSelection.of> {
  return setFenceGuardSelection.of(value);
}

/**
 * Armed fence-restore selection; mapped through `tr.changes` like
 * `pointerSelection` so a concurrent edit during the press cannot restore
 * stale absolute offsets.
 */
export const fenceGuardSelection = StateField.define<EditorSelection | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFenceGuardSelection)) {
        return effect.value;
      }
    }
    return value && tr.docChanged ? value.map(tr.changes) : value;
  },
});

/** Live Preview registers this so fence-margin restores map through edits. */
export const fenceGuardSelectionSupport: Extension = fenceGuardSelection;

function armFenceGuardSelection(
  view: EditorView,
  selection: EditorSelection,
): void {
  if (view.state.field(fenceGuardSelection, false) === undefined) {
    return;
  }
  view.dispatch({ effects: setFenceGuardSelection.of(selection) });
}

function clearFenceGuardSelection(view: EditorView): void {
  if (!view.state.field(fenceGuardSelection, false)) {
    return;
  }
  view.dispatch({ effects: setFenceGuardSelection.of(null) });
}

/**
 * Scrollbar / gutter / non-content chrome. Clicks here must not arm the fence
 * restore (and previously must not have been preventDefault'd).
 */
export function isEditorChromeTarget(
  view: {
    dom: HTMLElement;
    scrollDOM: HTMLElement;
    contentDOM: HTMLElement;
  },
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element) || !view.dom.contains(target)) {
    return false;
  }
  // Native scrollbar presses often target the scroller itself.
  if (target === view.scrollDOM) {
    return true;
  }
  if (target === view.contentDOM || view.contentDOM.contains(target)) {
    return false;
  }
  return true;
}

/**
 * Current fence offsets for a (possibly reused) widget shell.
 *
 * `MarkdownBlock.eq` / `GuardedWidget.eq` keep the same DOM when only text
 * *above* the diagram changes, so `RenderBlock.from`/`to` captured in `toDOM`
 * go stale. Resolve `from` live via `posAtDOM(shell)` and derive `to` from the
 * unchanged source span length.
 */
export function liveFenceOffsets(
  view: { posAtDOM(node: Node, offset?: number): number },
  shell: Node,
  spanLength: number,
): { blockFrom: number; blockTo: number } {
  const blockFrom = view.posAtDOM(shell);
  return { blockFrom, blockTo: blockFrom + spanLength };
}

/** Whether any modifier key is held, which turns a click into a selection gesture. */
function isModified(event: MouseEvent): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;
}

/**
 * Keep margin / SVG pass-through plain clicks from revealing a button-only
 * fence, without cancelling the initial mousedown.
 *
 * CodeMirror owns mousedown/move (focus, Shift/Cmd selection, drag-scroll).
 * Pointer freeze keeps the diagram rendered during the press. On a completed
 * non-drag plain click, restore the pre-press selection before thaw so the
 * caret does not stay inside the fence. Offsets are read live — not the from/to
 * captured at widget creation — so reuse after edits above still guards.
 */
export function bindFenceClickGuard(
  view: EditorView,
  shell: HTMLElement,
  block: { from: number; to: number },
  signal: AbortSignal,
): void {
  const guard = new FenceClickGuard(view, shell, block.to - block.from);
  const listen = { capture: true, signal };
  view.dom.addEventListener("mousedown", guard.onMouseDown, listen);
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  doc.addEventListener("mousemove", guard.onMouseMove, listen);
  for (const target of [doc, win]) {
    target?.addEventListener("mouseup", guard.onRelease, listen);
    target?.addEventListener("pointercancel", guard.cancel, listen);
  }
  win?.addEventListener("blur", guard.cancel, { signal });
}

class FenceClickGuard {
  private press: FenceGuardPress | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly shell: HTMLElement,
    /** Stable while this DOM is reused (source-eq); absolute from/to are not. */
    private readonly spanLength: number,
  ) {}

  readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.guardsMouseDown(event)) {
      this.cancel();
      return;
    }
    // Do not preventDefault — CM must start MouseSelection / focus / drag-scroll.
    const selection = this.view.state.selection;
    this.press = {
      x: event.clientX,
      y: event.clientY,
      dragged: false,
      selection,
      doc: this.view.state.doc,
    };
    armFenceGuardSelection(this.view, selection);
  };

  readonly onMouseMove = (event: MouseEvent): void => {
    if (this.press) {
      latchClickDrag(this.press, event.clientX, event.clientY);
    }
  };

  readonly onRelease = (event: Event): void => {
    const active = this.press;
    this.press = null;
    // Duplicate mouseup (window + document): do not clear shared mapped field.
    if (!ownsFenceGuardRelease(active)) {
      return;
    }
    if (
      !(event instanceof MouseEvent) ||
      event.type !== "mouseup" ||
      !shouldRestoreFenceClick({
        press: active,
        button: event.button,
        modified: isModified(event),
      })
    ) {
      clearFenceGuardSelection(this.view);
      return;
    }
    // After CM's mouseup selection (sync) and before pointer-freeze thaw
    // (setTimeout 0): microtasks run in between, so Mermaid stays rendered.
    queueMicrotask(() => this.restoreSelection(active));
  };

  readonly cancel = (): void => {
    if (this.press) {
      clearFenceGuardSelection(this.view);
    }
    this.press = null;
  };

  private guardsMouseDown(event: MouseEvent): boolean {
    let offsets: { blockFrom: number; blockTo: number };
    try {
      offsets = liveFenceOffsets(this.view, this.shell, this.spanLength);
    } catch {
      // Shell detached between abort and the event; let CM handle it.
      return false;
    }
    const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
    return shouldGuardFenceMouseDown({
      button: event.button,
      onControl: isBlockControl(this.shell, event.target),
      targetInsideShell: eventTargetInside(this.shell, event.target),
      pos: pos ?? null,
      ...offsets,
      modified: isModified(event),
      onChrome: isEditorChromeTarget(this.view, event.target),
    });
  }

  private restoreSelection(active: FenceGuardPress): void {
    const view = this.view;
    if (!view.dom.isConnected) {
      clearFenceGuardSelection(view);
      return;
    }
    const mapped = view.state.field(fenceGuardSelection, false) ?? null;
    const selection = resolveFenceGuardSelection({
      selection: active.selection,
      savedDoc: active.doc,
      currentDoc: view.state.doc,
      mapped,
    });
    const effects = mapped ? [setFenceGuardSelection.of(null)] : [];
    if (selection) {
      view.dispatch({ selection, scrollIntoView: false, effects });
    } else if (effects.length) {
      // Doc changed while held and no mapped selection — skip stale coords.
      view.dispatch({ effects });
    }
  }
}
