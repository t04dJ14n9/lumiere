import {
  EditorState,
  Transaction,
  type Text,
  type TransactionSpec,
} from "@codemirror/state";

/** A line that is only a list marker: `- `, `1. `, `- [ ] `, indented or not. */
const EMPTY_ITEM = /^\s*(?:[-*+]|\d+[.)])[ \t]+(\[.\][ \t]+)?$/u;
/** A list marker starting pasted text, with its checkbox if it has one. */
const PASTED_MARKER = /^\s*(?:[-*+]|\d+[.)])[ \t]+(\[.\][ \t]+)?/u;

/** The one insertion a paste made at its start state's single caret, if so. */
function pastedAt(tr: Transaction): { at: number; text: Text } | undefined {
  const { ranges, main } = tr.startState.selection;
  if (ranges.length > 1 || !main.empty) {
    return undefined;
  }
  let found: { at: number; text: Text } | undefined;
  let count = 0;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    count++;
    if (fromA === main.head && toA === main.head) {
      found = { at: fromA, text: tr.newDoc.slice(fromB, toB) };
    }
  });
  return count === 1 ? found : undefined;
}

/**
 * Pasting a list item onto an empty one keeps one marker, as Obsidian 1.14
 * does (measured): the line's marker stays and the pasted one goes, but a
 * pasted checkbox takes the place of the line's. The other pasted lines stay
 * as they are (ordered ones are numbered again after).
 */
export const pasteIntoListItem = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent("input.paste")) {
    return tr;
  }
  const pasted = pastedAt(tr);
  const line = pasted && tr.startState.doc.lineAt(pasted.at);
  const item = line && pasted.at === line.to && EMPTY_ITEM.exec(line.text);
  const text = pasted?.text.toString() ?? "";
  const marker = PASTED_MARKER.exec(text);
  if (!line || !item || !marker) {
    return tr;
  }
  let from = pasted.at;
  let insert = text.slice(marker[0].length);
  if (marker[1]) {
    // The pasted checkbox, in place of the line's own.
    from = item[1] ? line.to - item[1].length : pasted.at;
    insert = marker[1] + insert;
  }
  return {
    changes: { from, to: pasted.at, insert },
    selection: { anchor: from + insert.length },
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    annotations: Transaction.userEvent.of("input.paste"),
  } satisfies TransactionSpec;
});
