import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  HIGHLIGHT_COLOURS,
  type HighlightColour,
} from "../../markdown/dialect/highlight";
import type { LocalSuggestions, SuggestionContext } from "../suggest/api";

const MATH = new Set(["InlineMath", "BlockMath", "MathBlock"]);

const options = [
  { label: "Default", insert: "==", caret: 0, swatch: "default" },
  ...(Object.entries(HIGHLIGHT_COLOURS) as [HighlightColour, string][]).map(
    ([colour, emoji]) => ({
      label: colour[0]!.toUpperCase() + colour.slice(1),
      insert: `${emoji}==`,
      caret: emoji.length,
      swatch: colour,
    }),
  ),
];

/**
 * The colours Obsidian 1.14 offers once `==` opening a highlight is typed
 * (measured): Default, then each colour; taking one adds its emoji and the
 * closing `==`, the caret before it. Not after a closing `==` or `===`, nor
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
