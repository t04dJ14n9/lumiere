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

export type IndentTargetView = {
  contentDOM: EventTarget & { contains?: (node: EventTarget) => boolean };
  dom: EventTarget;
};

/**
 * True when Tab/indent capture should own this keydown (BH-040 / BH-066).
 * Exact `contentDOM` or a mark/text descendant inside it — but never a
 * nested property field or table-cell editor (those keep focus Tab).
 */
export function isNoteBodyIndentTarget(
  view: IndentTargetView,
  target: EventTarget | null,
): boolean {
  if (target === view.contentDOM) {
    return true;
  }
  if (
    !target ||
    typeof view.contentDOM.contains !== "function" ||
    !view.contentDOM.contains(target)
  ) {
    return false;
  }
  const element = elementForClosest(target);
  if (!element || typeof element.closest !== "function") {
    return false;
  }
  if (element.closest(nestedIndentOwner)) {
    return false;
  }
  // Nested CM editor widget (table cell) that is not the note body.
  const nested = element.closest(".cm-editor");
  return !nested || nested === view.dom;
}
