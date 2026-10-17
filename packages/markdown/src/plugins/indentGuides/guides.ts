import { Decoration } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { EditorState, Line, Range } from "@codemirror/state";
import { parseMarkdown } from "../../markdown/dialect";

export function indentation(text: string, tabSize: number): number {
  let width = 0;
  for (const char of text) {
    if (char === " ") {
      width++;
    } else if (char === "\t") {
      width += tabSize - (width % tabSize);
    } else {
      break;
    }
  }
  return width;
}

/** List chrome replaces source whitespace; code and quotes keep their own layout. */
function usesListLayout(state: EditorState, line: Line): boolean {
  const leading = /^[ \t]*/.exec(line.text)![0];
  const tree = parseMarkdown(state.doc);
  let isList = false;
  for (
    let node = tree.resolveInner(line.from + leading.length, 1);
    node.parent;
    node = node.parent
  ) {
    if (["CodeBlock", "FencedCode", "Blockquote"].includes(node.name)) {
      return false;
    }
    isList ||= node.name === "ListItem";
  }
  return isList;
}

export function guideDecorations(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[],
  isLivePreview: boolean,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const visible of visibleRanges) {
    for (let at = visible.from; at <= visible.to;) {
      const line = state.doc.lineAt(at);
      const width = indentation(line.text, state.tabSize);
      if (width && !(isLivePreview && usesListLayout(state, line))) {
        ranges.push(
          Decoration.line({
            attributes: {
              style: `--indent-width:${width}ch;--indent-step:${state.tabSize}ch`,
              class: "mw-indent-guide",
            },
          }).range(line.from),
        );
      }
      at = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}
