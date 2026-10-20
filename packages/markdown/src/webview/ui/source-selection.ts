import type { EditorView } from "@codemirror/view";
import { CLICK_SELECT, setPointerSelection } from "./pointer-selection";

/** Hand a rendered click to the editor, with the selection head at its start. */
export function selectRenderedSource(
  view: EditorView,
  span: { from: number; to: number },
  options: { settled?: boolean } = {},
): void {
  view.dispatch({
    selection: { anchor: span.to, head: span.from },
    scrollIntoView: false,
    userEvent: CLICK_SELECT,
    // Block clicks commit on release. Reveal now so the deferred pointer thaw
    // cannot redraw a stale widget selection after the first printable key.
    effects: options.settled ? setPointerSelection(null) : [],
  });
  view.focus();
  const anchor = view.domAtPos(span.to, -1);
  const head = view.domAtPos(span.from, 1);
  // A widget can retain its native caret while CM's observer still caches the
  // previous source selection. Re-selecting that same range needs an explicit
  // DOM handoff. Hidden source has no exact DOM positions; pointer thaw will
  // reveal it and synchronize the selection in that redraw instead.
  if (
    view.posAtDOM(anchor.node, anchor.offset) === span.to &&
    view.posAtDOM(head.node, head.offset) === span.from
  ) {
    view.dom.ownerDocument
      .getSelection()
      ?.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
  }
}
