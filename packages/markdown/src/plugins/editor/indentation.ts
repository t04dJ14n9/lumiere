import type {
  ChangeSpec,
  EditorState,
  Extension,
  Line,
  Transaction,
} from "@codemirror/state";
import { getIndentUnit, indentString } from "@codemirror/language";
import { indentLess, indentMore } from "@codemirror/commands";
import { completionStatus } from "@codemirror/autocomplete";
import { ViewPlugin, type EditorView, type KeyBinding } from "@codemirror/view";
import { renumberAround } from "../../markdown/ordered-lists";
import { lineMarkup, outerQuotes, textStart } from "../../markdown/list-markup";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

const listItem = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/;

function width(state: EditorState, text: string): number {
  const space = /^\s*/.exec(text)?.[0] ?? "";
  let column = 0;
  for (const char of space) {
    column =
      char === "\t"
        ? column + state.tabSize - (column % state.tabSize)
        : column + 1;
  }
  return column;
}

/** The list item on `line` and its nested lines, as a line-number range. */
export function itemLines(state: EditorState, line: Line): [number, number] {
  if (isQuoteListLine(line.text)) {
    return quoteItemLines(state, line);
  }
  const own = width(state, line.text);
  let last = line.number;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const text = state.doc.line(n).text;
    if (text.trim() === "" || width(state, text) <= own) {
      break;
    }
    last = n;
  }
  return [line.number, last];
}

/** True when the line is a list/task under blockquote markup (`> - …`). */
function isQuoteListLine(text: string): boolean {
  const { quotes, marker } = lineMarkup(text);
  return marker !== "" && quotes.includes(">");
}

/**
 * Nest indent under a blockquote: columns after `>` beyond the single
 * separator space before the list marker (`> -` → 0; `>   -` → 2).
 */
function quoteListNestIndent(state: EditorState, quotes: string): number {
  const gt = quotes.lastIndexOf(">");
  return gt < 0 ? 0 : Math.max(0, width(state, quotes.slice(gt + 1)) - 1);
}

/** Quote-list item + deeper nest under the same `>` prefix (BH-057). */
function quoteItemLines(state: EditorState, line: Line): [number, number] {
  const { quotes } = lineMarkup(line.text);
  const gt = quotes.lastIndexOf(">");
  const prefix = quotes.slice(0, gt + 1);
  const own = quoteListNestIndent(state, quotes);
  let last = line.number;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const text = state.doc.line(n).text;
    if (text.trim() === "") {
      break;
    }
    const next = lineMarkup(text);
    const nextGt = next.quotes.lastIndexOf(">");
    if (nextGt < 0 || next.quotes.slice(0, nextGt + 1) !== prefix) {
      break;
    }
    if (quoteListNestIndent(state, next.quotes) <= own) {
      break;
    }
    last = n;
  }
  return [line.number, last];
}

function reindent(target: Target, delta: number): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  if (isQuoteListLine(line.text)) {
    return reindentQuoteList(target, delta);
  }
  const [first, last] = itemLines(state, line);
  const unit = getIndentUnit(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const current = state.doc.line(n);
    const space = /^\s*/.exec(current.text)?.[0] ?? "";
    const next = Math.max(0, width(state, current.text) + delta * unit);
    if (delta < 0 && space.length === 0) {
      continue;
    }
    changes.push({
      from: current.from,
      to: current.from + space.length,
      insert: indentString(state, next),
    });
  }
  if (changes.length === 0) {
    return true;
  }
  // As in Obsidian, ordered lists the item leaves or joins count on again.
  const indented = state.update({ changes }).state;
  const numbers = indented.changes(
    renumberAround(indented.doc, { first, last }, state.tabSize),
  );
  target.dispatch(
    state.update({
      changes: state.changes(changes).compose(numbers),
      scrollIntoView: true,
      userEvent: delta > 0 ? "input.indent" : "delete.dedent",
    }),
  );
  return true;
}

/**
 * Tab / Shift+Tab for a list under a blockquote: adjust spaces after `>`
 * (BH-057) — instead of indentMore putting a tab before `>` (`\t> - item`).
 */
function reindentQuoteList(target: Target, delta: number): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const [first, last] = quoteItemLines(state, line);
  const unit = getIndentUnit(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const current = state.doc.line(n);
    const { quotes } = lineMarkup(current.text);
    const gt = quotes.lastIndexOf(">");
    if (gt < 0) {
      continue;
    }
    const nest = quoteListNestIndent(state, quotes);
    if (delta < 0 && nest === 0) {
      continue;
    }
    const nextNest = Math.max(0, nest + delta * unit);
    const prefix = quotes.slice(0, gt + 1);
    // Spaces after `>` (not indentString/tabs): keeps list under quote valid
    // Markdown when useTabs is on (BH-051 sibling; Host GUI `>   -` not `>\t-`).
    const newQuotes = prefix + " ".repeat(nextNest + 1);
    changes.push({
      from: current.from,
      to: current.from + quotes.length,
      insert: newQuotes,
    });
  }
  if (changes.length === 0) {
    return true;
  }
  const indented = state.update({ changes }).state;
  const numbers = indented.changes(
    renumberAround(indented.doc, { first, last }, state.tabSize),
  );
  target.dispatch(
    state.update({
      changes: state.changes(changes).compose(numbers),
      scrollIntoView: true,
      userEvent: delta > 0 ? "input.indent" : "delete.dedent",
    }),
  );
  return true;
}

function onListItem(state: EditorState): boolean {
  const { ranges, main } = state.selection;
  if (ranges.length > 1 || !main.empty) {
    return false;
  }
  const text = state.doc.lineAt(main.head).text;
  return listItem.test(text) || isQuoteListLine(text);
}

/**
 * Tab: indent a list item with its children (including under `>`, BH-057);
 * otherwise indent the lines the selection touches, as Obsidian does.
 */
export function indentTab(target: Target): boolean {
  if (onListItem(target.state)) {
    return reindent(target, 1);
  }
  return indentMore(target);
}

/** Shift+Tab: outdent a list item with its children or the selected lines. */
export function outdentTab(target: Target): boolean {
  if (onListItem(target.state)) {
    return reindent(target, -1);
  }
  indentLess(target);
  // Shift+Tab never moves focus out of the note, even with nothing to outdent.
  return true;
}

/**
 * Backspace at the start of a list/quote item's text:
 * - nested (indent > 0): outdent like Shift+Tab (BH-052);
 * - top-level: remove the list marker (and task box), as in Obsidian
 *   (BH-053) — instead of eating the space (`- [ ] |task` → `- [ ]|task`);
 * - inside a blockquote list: unwrap the list marker, keep the quotes (BH-054)
 *   — instead of eating the space (`> - |item` → `> -|item`);
 * - nested under a blockquote (`>   - |child`): reduce spaces after `>`
 *   (BH-055) — instead of eating the marker space (`>   -|child`);
 * - plain blockquote: drop one `>` level (BH-056) — instead of eating the
 *   space (`> |text` → `>|text`).
 * `listItem` skips quote-prefixed lines; detect markers via lineMarkup.
 */
export function outdentBackspace(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  if (range.head !== line.from + textStart(line.text)) {
    return false;
  }
  const { quotes, marker, task } = lineMarkup(line.text);
  // Nested non-quote: outdent (BH-052).
  if (listItem.test(line.text) && width(state, line.text) > 0) {
    return outdentTab(target);
  }
  // Nested under blockquote: outdent spaces after `>` (BH-055).
  if (marker !== "" || task !== "") {
    if (quotes.includes(">") && quoteListNestIndent(state, quotes) > 0) {
      return outdentQuoteList(target);
    }
    // Top-level list (BH-053) or quote-prefixed list (BH-054): unwrap marker.
    if (listItem.test(line.text) || quotes.includes(">")) {
      return unwrapListMarker(target);
    }
    return false;
  }
  // Plain blockquote text (no list marker): unwrap one `>` (BH-056).
  if (quotes.includes(">")) {
    return unwrapQuote(target);
  }
  return false;
}

/**
 * Outdent a list item nested under a blockquote by one indent unit of the
 * spaces after `>`, keeping one separator space and the marker (BH-055).
 */
function outdentQuoteList(target: Target): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const { quotes, marker, task } = lineMarkup(line.text);
  const gt = quotes.lastIndexOf(">");
  if (gt < 0) {
    return false;
  }
  const prefix = quotes.slice(0, gt + 1);
  const nest = quoteListNestIndent(state, quotes);
  if (nest === 0) {
    return false;
  }
  const unit = getIndentUnit(state);
  const nextNest = Math.max(0, nest - unit);
  // Keep one space after `>` as the marker separator.
  const newQuotes = prefix + indentString(state, nextNest + 1);
  const rest = line.text.slice(quotes.length);
  const textStartPos = newQuotes.length + marker.length + task.length;
  target.dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert: newQuotes + rest },
      selection: { anchor: line.from + textStartPos },
      scrollIntoView: true,
      userEvent: "delete.dedent",
    }),
  );
  return true;
}

/** Strip the list marker / task box; keep quotes and the item's text. */
function unwrapListMarker(target: Target): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const { quotes, marker, task } = lineMarkup(line.text);
  if (marker === "" && task === "") {
    return false;
  }
  const from = line.from + quotes.length;
  const to = from + marker.length + task.length;
  target.dispatch(
    state.update({
      changes: { from, to, insert: "" },
      selection: { anchor: from },
      scrollIntoView: true,
      userEvent: "delete.list",
    }),
  );
  return true;
}

/** Remove one blockquote level at the caret line (BH-056). */
function unwrapQuote(target: Target): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const { quotes } = lineMarkup(line.text);
  if (!quotes.includes(">")) {
    return false;
  }
  const outer = outerQuotes(quotes);
  const rest = line.text.slice(quotes.length);
  const insert = outer + rest;
  target.dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert },
      selection: { anchor: line.from + outer.length },
      scrollIntoView: true,
      userEvent: "delete.quote",
    }),
  );
  return true;
}

/** Tab / Shift+Tab indent action (BH-040). Pure so unit tests need no DOM. */
export function indentationTabKey(event: {
  key: string;
  shiftKey: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}): "indent" | "outdent" | undefined {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
    return undefined;
  }
  if (event.key !== "Tab") {
    return undefined;
  }
  return event.shiftKey ? "outdent" : "indent";
}

type BracketKeyEvent = {
  key: string;
  code?: string;
  keyCode?: number;
  shiftKey: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
};

/** Electron/Chromium Ctrl+[ → Escape while code stays BracketLeft (no Mod). */
function remappedCtrlBracketLeft(event: BracketKeyEvent): boolean {
  const code = event.code ?? "";
  return (
    code === "BracketLeft" && (event.key === "Escape" || event.keyCode === 27)
  );
}

function bracketIndentAction(
  event: BracketKeyEvent,
): "indent" | "outdent" | undefined {
  const code = event.code ?? "";
  // Prefer physical `code`; keyCode 219/221 covers older Electron; key text
  // still helps when code is missing. Mod+Escape is iPad/Chromium C-Esc.
  if (code === "BracketRight" || event.key === "]" || event.keyCode === 221) {
    return "indent";
  }
  if (
    code === "BracketLeft" ||
    event.key === "[" ||
    event.keyCode === 219 ||
    event.key === "Escape" ||
    event.keyCode === 27
  ) {
    return "outdent";
  }
  return undefined;
}

/**
 * Ctrl/Cmd+[ → outdent; Ctrl/Cmd+] → indent (BH-047).
 * Physical keyCodes 219/221 cover non-Latin layouts like find-keys.
 * Pure so unit tests need no DOM.
 */
export function indentationBracketKey(
  event: BracketKeyEvent,
  isMac: boolean,
): "indent" | "outdent" | undefined {
  if (event.isComposing || event.altKey || event.shiftKey) {
    return undefined;
  }
  // Bare Esc has code="Escape" — only the remap signature outdents without Mod.
  if (remappedCtrlBracketLeft(event)) {
    return "outdent";
  }
  const modifier = isMac
    ? Boolean(event.metaKey) && !event.ctrlKey
    : Boolean(event.ctrlKey) && !event.metaKey;
  if (!modifier) {
    return undefined;
  }
  return bracketIndentAction(event);
}

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

function captureIndentationKeys(view: EditorView, event: KeyboardEvent): void {
  // Exact contentDOM only (BH-040): nested widgets (properties / table cells)
  // must keep Tab for focus navigation. Ctrl+[ outdent targets the note body.
  if (event.isComposing || event.target !== view.contentDOM) {
    return;
  }
  const isMac = /Mac|iPhone|iPad/u.test(
    view.contentDOM.ownerDocument.defaultView?.navigator.platform ?? "",
  );
  const bracket = indentationBracketKey(event, isMac);
  // Host/webview may mark Ctrl+[ defaultPrevented before us; still outdent.
  // Tab keeps the BH-040 defaultPrevented early-out when not a bracket chord.
  if (!bracket && event.defaultPrevented) {
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
  // BH-052–056: list/quote text-start Backspace outdents or unwraps (Obsidian); else fall through.
  { key: "Backspace", run: outdentBackspace },
];
