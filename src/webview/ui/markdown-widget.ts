import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { RenderBlock } from "../../plugins/livePreview/api";
import type { RenderPass, RenderService } from "../../plugins/render/api";

/** Own a render pass even when an async post-processor finishes after removal. */
export class MarkdownBlock extends WidgetType {
  private readonly lifetimes = new WeakMap<HTMLElement, () => void>();

  constructor(
    readonly block: RenderBlock,
    private readonly render: RenderService,
    /**
     * Body click policy for revealing source:
     * - `true` (default): single click, as for math / code / callouts.
     * - `"dblclick"`: double-click only (Mermaid stays interactive on ordinary click).
     * - `false`: Edit button / caret entry only (embeds keep content clicks).
     */
    private readonly clickToEdit: boolean | "dblclick" = true,
  ) {
    super();
  }

  override eq(other: MarkdownBlock): boolean {
    return (
      this.render === other.render && this.block.source === other.block.source
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const shell = document.createElement("section");
    shell.className = `hybrid-block hybrid-${this.block.kind}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-block";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${this.block.kind} source`);
    const body = document.createElement("div");
    shell.append(edit, body);
    let live = true;
    let pass: RenderPass | undefined;
    const events = new AbortController();
    edit.addEventListener(
      "click",
      () => {
        const from = view.posAtDOM(shell);
        view.dispatch({ selection: { anchor: from }, scrollIntoView: true });
        view.focus();
      },
      { signal: events.signal },
    );
    if (this.clickToEdit === true) {
      bindClickToEdit(view, shell, events.signal);
    } else if (this.clickToEdit === "dblclick") {
      bindDoubleClickToEdit(view, shell, events.signal);
      bindFenceClickGuard(view, shell, this.block, events.signal);
    }
    this.lifetimes.set(shell, () => {
      live = false;
      events.abort();
      void pass?.dispose();
    });
    void this.render
      .into(body, this.block.source, {
        sourceLine: view.state.doc.lineAt(this.block.from).number - 1,
        measure: () => {
          if (live) {
            view.requestMeasure();
          }
        },
      })
      .then((result) => {
        pass = result;
        if (!live) {
          void pass.dispose();
        }
      })
      .catch(() => {
        if (live) {
          body.textContent = this.block.source;
          shell.classList.add("render-error");
          view.requestMeasure();
        }
      });
    return shell;
  }

  /**
   * Keep widget events (including blank diagram area) so CodeMirror does not
   * park the caret inside the replaced fence on click — that would reveal
   * Mermaid/math source without Edit / click-to-edit. Buttons and Mermaid SVG
   * labels stay native; document-level MouseSelection still covers drags that
   * start outside the widget.
   */
  override ignoreEvent(event: Event): boolean {
    return markdownBlockIgnoresEvent(event);
  }

  override destroy(dom: HTMLElement): void {
    this.lifetimes.get(dom)?.();
    this.lifetimes.delete(dom);
  }
}

/** Controls inside a rendered block keep their own click behaviour. */
const interactive =
  "a, button, input, select, textarea, summary, label, [contenteditable='true'], [data-href], .internal-link, .external-link";

/** Movement beyond this cancels click-to-edit for the active press. */
export const CLICK_DRAG_PX = 3;

/** Active click-to-edit press; `dragged` latches once the threshold is crossed. */
export type ClickToEditPress = {
  readonly x: number;
  readonly y: number;
  dragged: boolean;
};

/**
 * Reveal source on a true click, not on mousedown. Mousedown-to-edit jumped
 * the viewport (`scrollIntoView` to the fence start) and swallowed drags, so
 * Mermaid/math blocks could not be selected without scrolling to the block top.
 */
function bindClickToEdit(
  view: EditorView,
  shell: HTMLElement,
  signal: AbortSignal,
): void {
  let press: ClickToEditPress | null = null;
  const clearPress = (): void => {
    press = null;
  };
  const takePress = (): ClickToEditPress | null => {
    const active = press;
    clearPress();
    return active;
  };

  shell.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0 || isBlockControl(shell, event.target)) {
        clearPress();
        return;
      }
      press = { x: event.clientX, y: event.clientY, dragged: false };
    },
    { signal },
  );
  watchClickToEditGesture({
    view,
    shell,
    signal,
    getPress: () => press,
    takePress,
  });
}

/** Document-level move / release / cancel for one click-to-edit gesture. */
function watchClickToEditGesture(input: {
  view: EditorView;
  shell: HTMLElement;
  signal: AbortSignal;
  getPress: () => ClickToEditPress | null;
  takePress: () => ClickToEditPress | null;
}): void {
  const { view, shell, signal, getPress, takePress } = input;
  const doc = shell.ownerDocument;
  const win = doc.defaultView;
  doc.addEventListener(
    "mousemove",
    (event) => {
      const press = getPress();
      if (press) {
        latchClickDrag(press, event.clientX, event.clientY);
      }
    },
    { capture: true, signal },
  );
  const onRelease = (event: Event): void => {
    const active = takePress();
    if (
      active &&
      event.type === "mouseup" &&
      event instanceof MouseEvent &&
      clickToEditReleaseCommits({
        press: active,
        button: event.button,
        overWidget: eventTargetInside(shell, event.target),
        onControl: isBlockControl(shell, event.target),
      })
    ) {
      editOnClick(view, shell);
    }
  };
  for (const target of [doc, win]) {
    target?.addEventListener("mouseup", onRelease, { capture: true, signal });
    target?.addEventListener("pointercancel", () => takePress(), {
      capture: true,
      signal,
    });
  }
  win?.addEventListener("blur", () => takePress(), { signal });
}

/**
 * Whether CodeMirror should leave this event to the widget (true) or drive
 * mouse selection through it (false). `selectionchange` targets the Document;
 * CM still asks the widget that owns the selection anchor, so returning true
 * keeps native Mermaid/SVG label selections. Pointer ownership is bounded to
 * the widget shell — never via unbounded `target.closest(interactive)`.
 *
 * Blank diagram/math/code area also stays with the widget. If CM handled
 * mousedown it would place the caret inside the replace range and Live Preview
 * would reveal source without Edit / click-to-edit (including when the press
 * ends outside the widget). Selection drags that start outside still work:
 * CodeMirror's MouseSelection listens on the document for move/up.
 */
export function markdownBlockIgnoresEvent(event: Event): boolean {
  return markdownBlockIgnoresEventKind({
    type: event.type,
    targetIsElement: event.target instanceof Element,
    controlInsideWidget: pointerControlInsideWidget(event.target),
    nativeSelectableLabel: isNativeSelectableLabelTarget(event.target),
  });
}

/** Pure decision table for {@link markdownBlockIgnoresEvent} (unit-tested). */
export function markdownBlockIgnoresEventKind(input: {
  type: string;
  targetIsElement: boolean;
  controlInsideWidget: boolean;
  nativeSelectableLabel: boolean;
}): boolean {
  if (input.type === "selectionchange") {
    return true;
  }
  if (!input.targetIsElement) {
    return false;
  }
  // Controls and SVG labels keep native handling. Blank diagram/math/code area
  // must also stay with the widget: handing mousedown to CM parks the caret in
  // the replace range and reveals source without Edit / click-to-edit.
  return (
    input.controlInsideWidget ||
    input.nativeSelectableLabel ||
    input.targetIsElement
  );
}

/** Latch drag once the press travels beyond the click threshold. */
export function latchClickDrag(
  press: ClickToEditPress,
  clientX: number,
  clientY: number,
  threshold = CLICK_DRAG_PX,
): void {
  if (
    !press.dragged &&
    Math.hypot(clientX - press.x, clientY - press.y) > threshold
  ) {
    press.dragged = true;
  }
}

/**
 * Whether a mouseup should run click-to-edit. Requires an active matching
 * press that never crossed the drag threshold, ending over the widget (not a
 * control). Outside release / cancel clears the press without committing.
 */
export function clickToEditReleaseCommits(input: {
  press: ClickToEditPress | null;
  button: number;
  overWidget: boolean;
  onControl: boolean;
}): boolean {
  return (
    input.press !== null &&
    !input.press.dragged &&
    input.button === 0 &&
    input.overWidget &&
    !input.onControl
  );
}

function pointerControlInsideWidget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const shell = target.closest(".hybrid-block");
  return shell instanceof HTMLElement && isBlockControl(shell, target);
}

/** True when the event target is Mermaid SVG label text inside a widget. */
export function isNativeSelectableLabelTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const shell = target.closest(".hybrid-block");
  return shell instanceof HTMLElement && isNativeSelectableLabel(shell, target);
}

function isBlockControl(
  shell: HTMLElement,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const control = target.closest(interactive);
  return Boolean(control && control !== shell && shell.contains(control));
}

/**
 * Mermaid labels are SVG `<text>` / `<tspan>` (see diagrams.css). Keep their
 * mouse events so native selection can start; CM still owns blank diagram area.
 */
function isNativeSelectableLabel(shell: HTMLElement, target: Element): boolean {
  let node: Element | null = target;
  while (node && node !== shell) {
    const tag = node.tagName.toLowerCase();
    if (
      (tag === "text" || tag === "tspan") &&
      node.closest("svg") &&
      shell.contains(node)
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function eventTargetInside(
  shell: HTMLElement,
  target: EventTarget | null,
): boolean {
  return target instanceof Node && shell.contains(target);
}

/**
 * Reveal a rendered block's source with the caret at the end of the first
 * line (math / code / callouts on single click; Mermaid on double-click or
 * Edit). The pointer was already on-screen, so do not force a scroll.
 */
export function editOnClick(view: EditorView, shell: HTMLElement): void {
  const line = view.state.doc.lineAt(view.posAtDOM(shell));
  view.focus();
  view.dispatch({ selection: { anchor: line.to }, scrollIntoView: false });
}

/**
 * Whether a primary mousedown that missed the widget DOM maps into a replaced
 * fence and should arm the plain-click restore (diagram `clickToEdit: "dblclick"`).
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
    input.pos == null ||
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
  if (input.mapped != null) {
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

/**
 * Keep margin / SVG pass-through plain clicks from revealing a dblclick-only
 * fence, without cancelling the initial mousedown.
 *
 * CodeMirror owns mousedown/move (focus, Shift/Cmd selection, drag-scroll).
 * Pointer freeze keeps the diagram rendered during the press. On a completed
 * non-drag plain click, restore the pre-press selection before thaw so the
 * caret does not stay inside the fence. Offsets are read live — not the from/to
 * captured at widget creation — so reuse after edits above still guards.
 */
function bindFenceClickGuard(
  view: EditorView,
  shell: HTMLElement,
  block: { from: number; to: number },
  signal: AbortSignal,
): void {
  // Length is stable while this DOM is reused (source-eq); absolute from/to are not.
  const spanLength = block.to - block.from;
  let press: FenceGuardPress | null = null;
  const clearPress = (): void => {
    if (press) {
      clearFenceGuardSelection(view);
    }
    press = null;
  };
  const takePress = (): FenceGuardPress | null => {
    const active = press;
    press = null;
    return active;
  };

  view.dom.addEventListener(
    "mousedown",
    (event) => {
      let blockFrom: number;
      let blockTo: number;
      try {
        ({ blockFrom, blockTo } = liveFenceOffsets(view, shell, spanLength));
      } catch {
        // Shell detached between abort and the event; let CM handle it.
        clearPress();
        return;
      }
      const modified =
        event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;
      if (
        !shouldGuardFenceMouseDown({
          button: event.button,
          onControl: isBlockControl(shell, event.target),
          targetInsideShell: eventTargetInside(shell, event.target),
          pos: view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? null,
          blockFrom,
          blockTo,
          modified,
          onChrome: isEditorChromeTarget(view, event.target),
        })
      ) {
        clearPress();
        return;
      }
      // Do not preventDefault — CM must start MouseSelection / focus / drag-scroll.
      const selection = view.state.selection;
      press = {
        x: event.clientX,
        y: event.clientY,
        dragged: false,
        selection,
        doc: view.state.doc,
      };
      armFenceGuardSelection(view, selection);
    },
    { capture: true, signal },
  );

  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  doc.addEventListener(
    "mousemove",
    (event) => {
      if (press) {
        latchClickDrag(press, event.clientX, event.clientY);
      }
    },
    { capture: true, signal },
  );
  const onRelease = (event: Event): void => {
    const active = takePress();
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
        modified:
          event.shiftKey || event.metaKey || event.ctrlKey || event.altKey,
      })
    ) {
      clearFenceGuardSelection(view);
      return;
    }
    // After CM's mouseup selection (sync) and before pointer-freeze thaw
    // (setTimeout 0): microtasks run in between, so Mermaid stays rendered.
    queueMicrotask(() => {
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
      const clearEffect = view.state.field(fenceGuardSelection, false)
        ? setFenceGuardSelection.of(null)
        : null;
      if (!selection) {
        // Doc changed while held and no mapped selection — skip stale coords.
        if (clearEffect) {
          view.dispatch({ effects: clearEffect });
        }
        return;
      }
      view.dispatch(
        clearEffect
          ? { selection, scrollIntoView: false, effects: clearEffect }
          : { selection, scrollIntoView: false },
      );
    });
  };
  for (const target of [doc, win]) {
    target?.addEventListener("mouseup", onRelease, { capture: true, signal });
    target?.addEventListener("pointercancel", () => clearPress(), {
      capture: true,
      signal,
    });
  }
  win?.addEventListener("blur", () => clearPress(), { signal });
}

/**
 * Double-click reveals source for widgets that keep ordinary clicks
 * interactive (Mermaid). Ignores control targets and native-selectable SVG
 * labels so a label word-select is not torn down into fence edit.
 */
function bindDoubleClickToEdit(
  view: EditorView,
  shell: HTMLElement,
  signal: AbortSignal,
): void {
  shell.addEventListener(
    "dblclick",
    (event) => {
      if (event.button !== 0 || isBlockControl(shell, event.target)) {
        return;
      }
      if (
        event.target instanceof Element &&
        isNativeSelectableLabel(shell, event.target)
      ) {
        return;
      }
      event.preventDefault();
      editOnClick(view, shell);
    },
    { signal },
  );
}
