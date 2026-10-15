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
    private readonly clickToEdit = true,
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
    if (this.clickToEdit) {
      bindClickToEdit(view, shell, events.signal);
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
   * Let CodeMirror drive mouse selection through the block (so a drag keeps
   * scroll stable and can cover diagram source). Buttons and native Mermaid
   * label selection keep their own events.
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
 */
export function markdownBlockIgnoresEvent(event: Event): boolean {
  return markdownBlockIgnoresEventKind({
    type: event.type,
    targetIsElement: event.target instanceof Element,
    controlInsideWidget: pointerControlInsideWidget(event.target),
    nativeSelectableLabel: pointerNativeSelectableLabel(event.target),
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
  return input.controlInsideWidget || input.nativeSelectableLabel;
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

function pointerNativeSelectableLabel(target: EventTarget | null): boolean {
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
 * Clicking a rendered block (math, code, a callout, a diagram) reveals its
 * source with the caret at the end of the first line, as in Obsidian. The
 * click was already on-screen, so do not force a scroll to the fence start.
 */
export function editOnClick(view: EditorView, shell: HTMLElement): void {
  const line = view.state.doc.lineAt(view.posAtDOM(shell));
  view.focus();
  view.dispatch({ selection: { anchor: line.to }, scrollIntoView: false });
}
