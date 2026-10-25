/** Nested property fields / table cell editors keep their own Tab. */
const nestedIndentOwner =
  "[data-property-input], [data-property-list-input], .table-cell-content";

type ClosestEl = {
  closest?: (selector: string) => unknown;
  parentElement?: ClosestEl | null;
  nodeType?: number;
};

function elementForClosest(target: EventTarget | null): ClosestEl | null {
  if (!target || typeof target !== "object") {
    return null;
  }
  const node = target as ClosestEl;
  if (typeof node.closest === "function") {
    return node;
  }
  if (node.nodeType === 3 && node.parentElement) {
    return node.parentElement;
  }
  return null;
}

/**
 * Minimal view shape so units can stub without importing EditorView (DOM).
 * `contains` matches `Node.contains`.
 */
export type IndentTargetView = {
  contentDOM: EventTarget & { contains: (other: Node | null) => boolean };
  dom: EventTarget;
};

/**
 * True when Tab/indent capture should own this keydown (BH-040 / BH-066).
 * Exact `contentDOM`, or a mark/text caret target inside a note-body `.cm-line`
 * — never property/table chrome or nested cell editors (those keep focus Tab).
 */
export function isNoteBodyIndentTarget(
  view: IndentTargetView,
  target: EventTarget | null,
): boolean {
  if (target === view.contentDOM) {
    return true;
  }
  if (!target || !view.contentDOM.contains(target as Node)) {
    return false;
  }
  const element = elementForClosest(target);
  if (!element || typeof element.closest !== "function") {
    return false;
  }
  if (element.closest(nestedIndentOwner)) {
    return false;
  }
  // Property Add / table add-row buttons live in contentDOM widgets but
  // outside `.cm-line`; requiring a line keeps BH-040 focus Tab working.
  if (!element.closest(".cm-line")) {
    return false;
  }
  const nested = element.closest(".cm-editor");
  return !nested || nested === view.dom;
}
