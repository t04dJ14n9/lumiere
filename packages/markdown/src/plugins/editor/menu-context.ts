import { contributionId } from "../../shared/setting-schema";
import { ViewPlugin } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";

/**
 * VS Code builds a webview's context menu from the `data-vscode-context` of
 * the clicked element and its ancestors, read by a `contextmenu` listener on
 * the webview's window. The `lumiere.markdown.hasSelection` key that gates
 * the selection items travels from the webview through the extension host
 * to the workbench, so it lags the selection. On macOS a secondary click
 * (two-finger click or Ctrl-click) outside a selection first selects the
 * word under the pointer, as Chromium does there, and the menu opens before
 * the key can follow: the word looks selected but Copy Link for Agent is
 * missing. So the editor element carries the selection as it is when the
 * menu opens; that per-menu context shadows the global key.
 */
const CONTEXT_ATTRIBUTE = "data-vscode-context";

/** The parts of the browser's selection the menu needs. */
export interface DomSelection {
  /** Both ends lie in the editor's content. */
  isInContent: boolean;
  isCollapsed: boolean;
}

/**
 * Whether the menu offers selection items.
 *
 * Prefer a non-collapsed browser selection in the content (macOS secondary
 * click selects the word before CodeMirror reads it). Otherwise trust
 * CodeMirror: Vim character-visual keeps a CM range while the DOM caret
 * stays collapsed, and that must still offer Copy Link for Agent (BH-048).
 */
export function menuHasSelection(
  dom: DomSelection | null,
  isStateEmpty: boolean,
): boolean {
  if (dom?.isInContent && !dom.isCollapsed) {
    return true;
  }
  return !isStateEmpty;
}

/** The `data-vscode-context` value for a menu opened now. */
export function menuContext(hasSelection: boolean): string {
  return JSON.stringify({ [contributionId("hasSelection")]: hasSelection });
}

function readDomSelection(view: EditorView): DomSelection | null {
  const selection = view.contentDOM.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  return {
    isInContent:
      view.contentDOM.contains(selection.anchorNode) &&
      view.contentDOM.contains(selection.focusNode),
    isCollapsed: selection.isCollapsed,
  };
}

/**
 * The attribute goes on the editor element, not the content: CodeMirror
 * observes the content's attributes and restores its own. The listener is a
 * plain one on the editor element because CodeMirror's handlers skip events
 * inside widgets, and a rendered link or image can sit in the selection; it
 * runs before VS Code's window listener as the event bubbles.
 */
export const menuSelectionContext = ViewPlugin.define((view) => {
  const stampSelection = () => {
    const hasSelection = menuHasSelection(
      readDomSelection(view),
      view.state.selection.main.empty,
    );
    view.dom.setAttribute(CONTEXT_ATTRIBUTE, menuContext(hasSelection));
  };
  view.dom.addEventListener("contextmenu", stampSelection);
  return {
    destroy() {
      view.dom.removeEventListener("contextmenu", stampSelection);
      view.dom.removeAttribute(CONTEXT_ATTRIBUTE);
    },
  };
});
