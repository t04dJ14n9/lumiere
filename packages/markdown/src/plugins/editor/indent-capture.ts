import { completionStatus } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type KeyBinding } from "@codemirror/view";
import {
  indentTab,
  indentationBracketKey,
  indentationTabKey,
  outdentBackspace,
  outdentTab,
} from "./indentation";
import { isNoteBodyIndentTarget } from "./indent-target";
import { onSetextHeading } from "./setext-indent";

/**
 * Capture-phase Tab / Shift+Tab so Vim's override-slot DOM handler cannot
 * swallow indent (BH-040). Also Mod-[ / Mod-] so Vim INSERT Ctrl+[ cannot
 * Esc instead of outdent (BH-047; Ctrl+] indent already reached CM).
 * Prec.highest alone is too late because Vim registers in the `override`
 * slot (same pattern as BH-006 image keys). Keep the keymap for Insert /
 * Vim-off; skip Tab while suggest owns it.
 */

/** BH-052–056: list/quote text-start Backspace outdents or unwraps (Vim INSERT too). */
function captureBackspaceOutdent(view: EditorView, event: KeyboardEvent): void {
  if (
    event.key !== "Backspace" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }
  if (!outdentBackspace(view)) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** Absorb Tab when setext no-op after another handler preventDefault'd (BH-066). */
function absorbPreventedSetextTab(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (event.key !== "Tab" || event.shiftKey || !onSetextHeading(view.state)) {
    return false;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

function captureIndentationKeys(view: EditorView, event: KeyboardEvent): void {
  // Note body (contentDOM or mark descendant). Nested property/table editors
  // keep Tab (BH-040). Mark descendants used to early-out and miss setext
  // no-op in Live Preview (BH-066 Host GUI).
  if (event.isComposing || !isNoteBodyIndentTarget(view, event.target)) {
    return;
  }
  const isMac = /Mac|iPhone|iPad/u.test(
    view.contentDOM.ownerDocument.defaultView?.navigator.platform ?? "",
  );
  const bracket = indentationBracketKey(event, isMac);
  // Host/webview may mark Ctrl+[ defaultPrevented before us; still outdent.
  // Tab: still absorb setext no-op when something else preventDefault'd first
  // (otherwise Vim/default can insert \t and break the heading — BH-066).
  if (!bracket && event.defaultPrevented) {
    absorbPreventedSetextTab(view, event);
    return;
  }
  const action = indentationTabKey(event) ?? bracket;
  if (!action) {
    captureBackspaceOutdent(view, event);
    return;
  }
  // Suggest owns Tab while a completion is open (Obsidian parity).
  if (event.key === "Tab" && completionStatus(view.state) === "active") {
    return;
  }
  const ran = action === "indent" ? indentTab(view) : outdentTab(view);
  if (!ran) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

const indentationCapture = ViewPlugin.define((view) => {
  const onKeydown = (event: KeyboardEvent) =>
    captureIndentationKeys(view, event);
  // contentDOM only (BH-040/006). view.dom would see nested widget focus and
  // steal Tab from properties/tables (browser CI regression).
  view.contentDOM.addEventListener("keydown", onKeydown, true);
  return {
    destroy() {
      view.contentDOM.removeEventListener("keydown", onKeydown, true);
    },
  };
});

export function indentationDom(): Extension {
  return indentationCapture;
}

export const indentationKeymap: readonly KeyBinding[] = [
  { key: "Tab", run: indentTab, shift: outdentTab, preventDefault: true },
  // BH-047: same chords as CM standardKeymap; capture also owns them over Vim.
  { key: "Mod-]", run: indentTab, preventDefault: true },
  { key: "Mod-[", run: outdentTab, preventDefault: true },
  // BH-052–056: list/quote text-start Backspace outdents or unwraps (Obsidian).
  { key: "Backspace", run: outdentBackspace },
];
