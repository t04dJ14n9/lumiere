import { EditorSelection } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { Command } from "@codemirror/view";
import { markdownParser } from "../../markdown/dialect";
const formattingParser = markdownParser;
export function clearInlineFormatting(source: string): string {
  const removed: { from: number; to: number }[] = [];
  formattingParser.parse(source).iterate({
    enter(node) {
      if (
        [
          "EmphasisMark",
          "StrikethroughMark",
          "HighlightMark",
          "MathMark",
        ].includes(node.name) ||
        (node.name === "CodeMark" && node.node.parent?.name === "InlineCode")
      ) {
        removed.push({ from: node.from, to: node.to });
      } else if (node.name === "ObsidianComment") {
        removed.push(
          { from: node.from, to: node.from + 2 },
          { from: node.to - 2, to: node.to },
        );
      }
    },
  });
  let result = source;
  for (const range of removed.sort((left, right) => right.from - left.from)) {
    result = result.slice(0, range.from) + result.slice(range.to);
  }
  return result;
}

export function wrapSelection(marker: string): Command {
  return (view) => {
    if (view.state.readOnly) {
      return false;
    }
    const changes = view.state.changeByRange((range) => {
      if (range.empty) {
        const kind = {
          "**": "StrongEmphasis",
          "*": "Emphasis",
          "~~": "Strikethrough",
          "==": "Highlight",
          "`": "InlineCode",
        }[marker];
        for (
          let node = syntaxTree(view.state).resolveInner(range.from, 1);
          node;
          node = node.parent!
        ) {
          if (
            node.name === kind &&
            view.state.sliceDoc(node.from, node.from + marker.length) ===
              marker &&
            view.state.sliceDoc(node.to - marker.length, node.to) === marker &&
            range.from >= node.from + marker.length &&
            range.from <= node.to - marker.length
          ) {
            return {
              changes: [
                { from: node.from, to: node.from + marker.length },
                { from: node.to - marker.length, to: node.to },
              ],
              range: EditorSelection.cursor(range.from - marker.length),
            };
          }
        }
        const word = view.state.wordAt(range.from);
        if (word) {
          return {
            changes: {
              from: word.from,
              to: word.to,
              insert: marker + view.state.sliceDoc(word.from, word.to) + marker,
            },
            range: EditorSelection.cursor(range.from + marker.length),
          };
        }
      }
      const selected = view.state.sliceDoc(range.from, range.to);
      if (
        selected.startsWith(marker) &&
        selected.endsWith(marker) &&
        selected.length >= marker.length * 2
      ) {
        return {
          changes: {
            from: range.from,
            to: range.to,
            insert: selected.slice(marker.length, -marker.length),
          },
          range: EditorSelection.range(
            range.from,
            range.to - marker.length * 2,
          ),
        };
      }
      if (
        view.state.sliceDoc(
          Math.max(0, range.from - marker.length),
          range.from,
        ) === marker &&
        view.state.sliceDoc(range.to, range.to + marker.length) === marker
      ) {
        return {
          changes: [
            { from: range.from - marker.length, to: range.from },
            { from: range.to, to: range.to + marker.length },
          ],
          range: EditorSelection.range(
            range.from - marker.length,
            range.to - marker.length,
          ),
        };
      }
      return {
        changes: {
          from: range.from,
          to: range.to,
          insert: marker + selected + marker,
        },
        range: EditorSelection.range(
          range.from + marker.length,
          range.to + marker.length,
        ),
      };
    });
    view.dispatch({ ...changes, userEvent: "input" });
    return true;
  };
}
