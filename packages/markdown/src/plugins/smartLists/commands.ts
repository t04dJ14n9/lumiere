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
} from "../../markdown/list-markup";
import { renumberAround } from "../../markdown/ordered-lists";

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
  return ok && result ? keepSpaceBeforeCaret(state, result) : null;
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
 * Enter: continue bullets, numbers, quotes and tasks; leave the list on an
 * empty item, and a quote level on an empty quoted line.
 */
export function continueList(target: Target): boolean {
  const { state } = target;
  const range = state.selection.main;
  if (state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  if (isEmptyQuote(line.text)) {
    return leaveQuoteLevel(target, line);
  }
  const item = continuedItem(state, range.head);
  if (item) {
    return newItemAfter(target, item);
  }
  const match = task.exec(line.text);
  if (!match || range.head < line.from + match[0].length) {
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
  const head = tr.newSelection.main.head;
  const next = tr.newDoc.lineAt(head);
  if (!listStart.test(next.text.slice(0, head - next.from))) {
    return dispatchResult(target, tr);
  }
  const box2 = ChangeSet.of([{ from: head, insert: "[ ] " }], tr.newDoc.length);
  target.dispatch(
    state.update({
      changes: tr.changes.compose(box2),
      selection: EditorSelection.cursor(head + 4),
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

/**
 * Enter on an empty quoted line, as in Obsidian: the line steps out one
 * quote level and the next line starts at that level.
 */
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
 * keeps the quotes and lines up with a list item's text.
 */
export function continueLine(target: Target): boolean {
  const { state } = target;
  if (state.selection.ranges.length > 1) {
    return false;
  }
  const line = state.doc.lineAt(state.selection.main.head);
  target.dispatch(
    state.update(
      state.replaceSelection(state.lineBreak + continuationPrefix(line.text)),
      { scrollIntoView: true, userEvent: "input" },
    ),
  );
  return true;
}
