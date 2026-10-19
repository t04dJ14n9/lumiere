import { syntaxTree } from "@codemirror/language";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  HIGHLIGHT_COLOURS,
  type HighlightColour,
} from "../../markdown/dialect/highlight";
import type {
  LocalSuggestion,
  LocalSuggestions,
  SuggestionContext,
} from "../suggest/api";

const MATH = new Set(["InlineMath", "BlockMath", "MathBlock"]);

const options: readonly LocalSuggestion[] = [
  {
    label: "Default",
    apply: (state, range) => highlightColourEdit(state, range.to, ""),
    swatch: "default",
  },
  ...(
    Object.entries(HIGHLIGHT_COLOURS) as [HighlightColour, string][]
  ).map<LocalSuggestion>(([colour, emoji]) => ({
    label: colour[0]!.toUpperCase() + colour.slice(1),
    apply: (state, range) => highlightColourEdit(state, range.to, emoji),
    swatch: colour,
  })),
];

/**
 * The colours Obsidian 1.14 offers once `==` opening a highlight is typed
 * (measured): Default, then each colour. Accepting wraps an immediately
 * following word, reuses its closing `==`, or opens an empty pair, with the
 * caret after the opening and colour. Not after a closing `==` or `===`, nor
 * in math (code is left out for every suggestion).
 */
export function highlightColourSuggestion({
  state,
  pos,
}: SuggestionContext): LocalSuggestions | undefined {
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);
  if (!before.endsWith("==") || before.endsWith("===")) {
    return undefined;
  }
  // An odd number of `==` before it on the line: this one closes.
  if ((before.slice(0, -2).split("==").length - 1) % 2 === 1) {
    return undefined;
  }
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  for (; node; node = node.parent) {
    if (MATH.has(node.name)) {
      return undefined;
    }
  }
  return { at: pos, options };
}

function highlightColourEdit(
  state: EditorState,
  pos: number,
  emoji: string,
): TransactionSpec {
  const word = state.wordAt(pos);
  if (word?.from !== pos) {
    return {
      changes: { from: pos, insert: `${emoji}==` },
      selection: { anchor: pos + emoji.length },
    };
  }
  if (state.sliceDoc(word.to, word.to + 2) === "==") {
    return {
      changes: { from: pos, insert: emoji },
      selection: { anchor: pos + emoji.length },
    };
  }
  // Close before the word's surrounding formatting, so accepting a colour
  // after bolding produces **==🔴word==** in one edit.
  return {
    changes: {
      from: pos - 2,
      to: word.to,
      insert: `==${emoji}${state.sliceDoc(word.from, word.to)}==`,
    },
    selection: { anchor: pos + emoji.length },
  };
}
