import {
  EditorSelection,
  EditorState,
  type Extension,
  type Text,
  type Transaction,
} from "@codemirror/state";

/**
 * Where the note's body begins: the offset after the closing `---` line of a
 * closed frontmatter block, or undefined without one. It mirrors the Markdown
 * dialect's Frontmatter rule (an unclosed block is not a properties block).
 */
export function frontmatterBodyStart(doc: Text): number | undefined {
  if (doc.lines < 2 || doc.line(1).text !== "---") {
    return undefined;
  }
  for (let number = 2; number <= doc.lines; number++) {
    const line = doc.line(number);
    if (/^(---|\.\.\.)\s*$/.test(line.text)) {
      return Math.min(doc.length, line.to + 1);
    }
  }
  return undefined;
}

const typed = (transaction: Transaction) =>
  transaction.isUserEvent("input") ||
  transaction.isUserEvent("delete") ||
  transaction.isUserEvent("move");

/**
 * Obsidian 1.14.4 never lets the text caret into the Properties block
 * (docs/obsidian-measurements/properties/caret-and-properties.mjs): every
 * selection endpoint that lands in the frontmatter (arrow keys, Home,
 * Ctrl+Home, Select All, Shift+arrows, programmatic reveals, undo) is moved to
 * the start of the body, and typing or deleting (Backspace at the start of the
 * body) never reaches into it. Edits made through the Properties controls are
 * not user input events, so they pass.
 */
export function propertyCaretGuard(active: () => boolean): Extension {
  return EditorState.transactionFilter.of((transaction) => {
    if (!active()) {
      return transaction;
    }
    if (typed(transaction)) {
      const before = frontmatterBodyStart(transaction.startState.doc);
      let touches = false;
      if (before !== undefined) {
        transaction.changes.iterChangedRanges((from) => {
          touches ||= from < before;
        });
      }
      if (touches) {
        return [];
      }
    }
    const start = frontmatterBodyStart(transaction.newDoc);
    if (start === undefined) {
      return transaction;
    }
    const resulting = transaction.newSelection;
    if (resulting.ranges.every((range) => range.from >= start)) {
      return transaction;
    }
    const clamp = (position: number) => Math.max(position, start);
    return [
      transaction,
      {
        selection: EditorSelection.create(
          resulting.ranges.map((range) =>
            EditorSelection.range(clamp(range.anchor), clamp(range.head)),
          ),
          resulting.mainIndex,
        ),
      },
    ];
  });
}
