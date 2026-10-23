import { ChangeSet, EditorSelection } from "@codemirror/state";
import type { ChangeSpec, EditorState, Transaction } from "@codemirror/state";
import { insertNewlineContinueMarkupCommand } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  continuationPrefix,
  isEmptyQuote,
  lineMarkup,
  outerQuotes,
  textStart,
} from "../../markdown/list-markup";
import { renumberAround } from "../../markdown/ordered-lists";
import {
  continueFootnoteDefinition,
  softBreakFootnoteDefinition,
} from "./footnote-enter";
import { softBreakLinkReferenceDefinition } from "./linkref-break";
import { continueLinkReferenceDefinition } from "./linkref-enter";
import { exitSetextHeading } from "./setext-enter";
import { exitAtxHeading } from "./atx-enter";
import { exitCalloutTitle } from "./callout-enter";

interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

// An empty item ends the list instead of making it loose, as in Obsidian.
const continueMarkup = insertNewlineContinueMarkupCommand({
  nonTightLists: false,
});
const prefix = String.raw`^(\s*(?:>\s?)*\s*(?:[-*+]|\d+[.)]))`;
const task = new RegExp(`${prefix}(\\s+\\[[^\\]\\n]\\])(\\s|$)`);
const listStart = new RegExp(`${prefix}\\s$`);

function run(state: EditorState): Transaction | null {
  let result: Transaction | null = null;
  const ok = continueMarkup({
    state,
    dispatch: (tr) => {
      result = tr;
    },
  });
  return ok && result
    ? matchSourceIndent(state, keepSpaceBeforeCaret(state, result))
    : null;
}

/** Column width of leading whitespace, tabs expanded by `tabSize`. */
function indentWidth(pad: string, tabSize: number): number {
  let column = 0;
  for (const char of pad) {
    column = char === "\t" ? column + tabSize - (column % tabSize) : column + 1;
  }
  return column;
}

/**
 * When `useTabs` is on, CodeMirror continues a spaces-only indented item with a
 * tab (4 spaces → one tab). Obsidian keeps the line's indent style. Expand
 * leading tabs in the continue insert to spaces so siblings stay spaces (BH-051).
 */
function matchSourceIndent(state: EditorState, tr: Transaction): Transaction {
  const caret = state.selection.main.head;
  const sourcePad = /^[ \t]*/u.exec(state.doc.lineAt(caret).text)?.[0] ?? "";
  if (sourcePad.length === 0 || sourcePad.includes("\t")) {
    return tr;
  }
  const changes: ChangeSpec[] = [];
  let changed = false;
  tr.changes.iterChanges((...change) => {
    const [fromA, toA, , , inserted] = change;
    let text = inserted.toString();
    if (text.includes("\t")) {
      const next = text.replace(
        /(^|\n)(\t+)/g,
        (_m, lead: string, tabs: string) =>
          lead + " ".repeat(tabs.length * state.tabSize),
      );
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
    changes.push({ from: fromA, to: toA, insert: text });
  });
  if (!changed) {
    return tr;
  }
  const set = state.changes(changes);
  return state.update({
    changes: set,
    selection: EditorSelection.cursor(set.mapPos(caret, 1)),
    scrollIntoView: true,
    userEvent: "input",
  });
}

/** Empty bullet/number item (no task box): Enter outdents or leaves the list. */
function isEmptyListItem(text: string): boolean {
  const { marker, task } = lineMarkup(text);
  return (
    marker !== "" && task === "" && text.slice(textStart(text)).trim() === ""
  );
}

/**
 * Enter on an empty nested item steps out one list level; on a top-level empty
 * item it leaves the list. Done here so a tab-indented empty sibling under a
 * spaces-indented parent cannot become `\t--` via CodeMirror (BH-051).
 */
function leaveEmptyListItem(
  target: Target,
  line: { from: number; to: number; number: number; text: string },
): boolean {
  const { state } = target;
  const { quotes, marker } = lineMarkup(line.text);
  if (quotes.includes(">")) {
    return false;
  }
  const width = indentWidth(quotes, state.tabSize);
  let insert: string;
  if (width === 0) {
    insert = "";
  } else {
    let newPad: string | null = null;
    for (let n = line.number - 1; n >= 1; n--) {
      const prev = state.doc.line(n);
      if (prev.text.trim() === "") {
        continue;
      }
      const previous = lineMarkup(prev.text);
      if (previous.marker === "") {
        break;
      }
      if (indentWidth(previous.quotes, state.tabSize) < width) {
        newPad = previous.quotes;
        break;
      }
    }
    insert = (newPad ?? "") + marker;
  }
  target.dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

/**
 * CodeMirror drops the spaces before the caret when it continues a list;
 * Obsidian keeps them (`- |a` gives `- ` and `- |a`).
 */
function keepSpaceBeforeCaret(
  state: EditorState,
  tr: Transaction,
): Transaction {
  const caret = state.selection.main.head;
  const changes: ChangeSpec[] = [];
  let kept = false;
  tr.changes.iterChanges((...change) => {
    const [fromA, toA, , , inserted] = change;
    const text = inserted.toString();
    if (
      toA === caret &&
      fromA < caret &&
      text.startsWith(state.lineBreak) &&
      /^[ \t]+$/u.test(state.sliceDoc(fromA, toA))
    ) {
      kept = true;
      changes.push({ from: caret, insert: text });
    } else {
      changes.push({ from: fromA, to: toA, insert: text });
    }
  });
  if (!kept) {
    return tr;
  }
  const set = state.changes(changes);
  return state.update({
    changes: set,
    selection: EditorSelection.cursor(set.mapPos(caret, 1)),
    scrollIntoView: true,
    userEvent: "input",
  });
}

/**
 * Enter: continue bullets, numbers, quotes, tasks, footnote and link-ref definitions
 * (incl. quoted footnotes, BH-073); callout title content-start exits intact (BH-085)
 * or empty unwrap (BH-086);
 * leave the list on an empty item, a quote level on an empty quoted line, and
 * a footnote on an empty indented continuation (BH-060).
 */
export function continueList(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  if (exitSetextHeading(target)) {
    return true;
  }
  if (exitAtxHeading(target, false)) {
    return true;
  }
  if (exitCalloutTitle(target)) {
    return true;
  }
  if (continueFootnoteDefinition(target)) {
    return true;
  }
  if (continueLinkReferenceDefinition(target)) {
    return true;
  }
  const line = state.doc.lineAt(range.head);
  if (isEmptyQuote(line.text)) {
    return leaveQuoteLevel(target, line);
  }
  if (
    isEmptyListItem(line.text) &&
    range.head >= line.from + textStart(line.text) &&
    leaveEmptyListItem(target, line)
  ) {
    return true;
  }
  const item = continuedItem(state, range.head);
  if (item) {
    return newItemAfter(target, item);
  }
  return continueTaskOrMarkup(target, line, range.head);
}

/** Task box continue / empty-task leave, else lang-markdown continueMarkup. */
function continueTaskOrMarkup(
  target: Target,
  line: { from: number; text: string },
  head: number,
): boolean {
  const { state } = target;
  const match = task.exec(line.text);
  if (!match || head < line.from + match[0].length) {
    return dispatchResult(target, run(state));
  }
  const [, marker = "", taskBox = ""] = match;
  const box = {
    from: line.from + marker.length,
    to: line.from + marker.length + taskBox.length,
  };
  if (line.text.slice(match[0].length).trim() === "") {
    return emptyTask(target, box);
  }
  const tr = run(state);
  if (!tr) {
    return false;
  }
  const nextHead = tr.newSelection.main.head;
  const next = tr.newDoc.lineAt(nextHead);
  if (!listStart.test(next.text.slice(0, nextHead - next.from))) {
    return dispatchResult(target, tr);
  }
  const box2 = ChangeSet.of(
    [{ from: nextHead, insert: "[ ] " }],
    tr.newDoc.length,
  );
  target.dispatch(
    state.update({
      changes: tr.changes.compose(box2),
      selection: EditorSelection.cursor(nextHead + 4),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

function emptyTask(target: Target, box: { from: number; to: number }): boolean {
  const { state } = target;
  const removeBox = state.changes(box);
  const next = state.update({ changes: removeBox }).state;
  const tr = run(next);
  if (!tr) {
    return false;
  }
  target.dispatch(
    state.update({
      changes: removeBox.compose(tr.changes),
      selection: tr.newSelection,
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

function dispatchResult(target: Target, tr: Transaction | null): boolean {
  if (!tr) {
    return false;
  }
  target.dispatch(tr);
  return true;
}

function leaveQuoteLevel(
  target: Target,
  line: { from: number; to: number; text: string },
): boolean {
  const { state } = target;
  const outer = outerQuotes(lineMarkup(line.text).quotes);
  const insert = outer + state.lineBreak + outer;
  target.dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

/** The list item whose continuation line (not its marker line) holds `pos`. */
function continuedItem(state: EditorState, pos: number): SyntaxNode | null {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") {
      return null;
    }
    if (node.name === "ListItem") {
      const markerLine = state.doc.lineAt(node.from).number;
      return markerLine === state.doc.lineAt(pos).number ? null : node;
    }
  }
  return null;
}

/**
 * Enter on an item's continuation line starts the next item, as in
 * Obsidian: same marker (the next number, an open task box).
 */
function newItemAfter(target: Target, item: SyntaxNode): boolean {
  const { state } = target;
  const caret = state.selection.main.head;
  const markerLine = state.doc.lineAt(item.from);
  const { quotes, marker, task: box } = lineMarkup(markerLine.text);
  const number = /^(\d+)([.)])/u.exec(marker);
  const next = number ? `${Number(number[1]) + 1}${number[2]} ` : marker;
  const insert = state.lineBreak + quotes + next + (box ? "[ ] " : "");
  const added = state.update({ changes: { from: caret, insert } }).state;
  const line = added.doc.lineAt(caret + insert.length).number;
  const numbers = added.changes(
    renumberAround(added.doc, { first: line, last: line }, state.tabSize),
  );
  const changes = state.changes({ from: caret, insert }).compose(numbers);
  target.dispatch(
    state.update({
      changes,
      selection: EditorSelection.cursor(changes.mapPos(caret, 1)),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

/**
 * Shift+Enter: a line break inside the block, as in Obsidian: the new line
 * keeps the quotes and lines up with a list item's text. Setext headings
 * exit below the underline like Enter (BH-076 / BH-059). ATX headings exit
 * below the heading line or unwrap empty markers (BH-084). Callout titles
 * exit intact at content start or unwrap empty openers (BH-085 / BH-086).
 * Footnote definitions soft-break with
 * a tab body indent (BH-077 / BH-060). Link reference definitions soft-break
 * with a tab body indent (BH-079).
 *
 * When the caret is on an empty line under a list/quote (the usual place a
 * Live Preview click or End lands once the file has a trailing newline),
 * fill that line with the previous item's continuation indent instead of
 * inserting another bare break (BH-049). Empty lines under footnotes or
 * link-refs fill with the body indent.
 */
export function continueLine(target: Target): boolean {
  const { state } = target;
  if (state.selection.ranges.length > 1) {
    return false;
  }
  // Same setext exit as Enter (BH-076): soft-break must not orphan ===/---.
  if (exitSetextHeading(target)) {
    return true;
  }
  // ATX exit / empty unwrap (BH-084): soft-break must not orphan `# ` titles.
  if (exitAtxHeading(target, true)) {
    return true;
  }
  // Callout title content-start exit / empty unwrap (BH-085 / BH-086).
  if (exitCalloutTitle(target)) {
    return true;
  }
  // Footnote soft-break (BH-077) before link-ref (BH-079); footnotes use [^].
  if (softBreakFootnoteDefinition(target)) {
    return true;
  }
  if (softBreakLinkReferenceDefinition(target)) {
    return true;
  }
  const line = state.doc.lineAt(state.selection.main.head);
  if (line.text === "" && line.number > 1) {
    const prev = state.doc.line(line.number - 1);
    const prefix = continuationPrefix(prev.text);
    if (prefix !== "" && textStart(prev.text) > 0) {
      target.dispatch(
        state.update({
          changes: { from: line.from, to: line.to, insert: prefix },
          selection: EditorSelection.cursor(line.from + prefix.length),
          scrollIntoView: true,
          userEvent: "input",
        }),
      );
      return true;
    }
  }
  target.dispatch(
    state.update(
      state.replaceSelection(state.lineBreak + continuationPrefix(line.text)),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
}
