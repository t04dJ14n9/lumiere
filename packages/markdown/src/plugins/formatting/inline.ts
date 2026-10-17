import {
  EditorSelection,
  type EditorState,
  type SelectionRange,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
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
    const changes = view.state.changeByRange((range) =>
      toggleRange(view.state, range, marker),
    );
    view.dispatch({ ...changes, userEvent: "input" });
    return true;
  };
}

function toggleRange(
  state: EditorState,
  range: SelectionRange,
  marker: string,
) {
  if (range.empty) {
    const unwrapped = unwrapAtCaret(state, range.from, marker);
    if (unwrapped) {
      return unwrapped;
    }
    const word = state.wordAt(range.from);
    if (word) {
      return {
        changes: {
          from: word.from,
          to: word.to,
          insert: marker + state.sliceDoc(word.from, word.to) + marker,
        },
        range: EditorSelection.cursor(range.from + marker.length),
      };
    }
  }
  return toggleSelectedText(state, range, marker);
}

function unwrapAtCaret(state: EditorState, position: number, marker: string) {
  const kind = {
    "**": "StrongEmphasis",
    "*": "Emphasis",
    "~~": "Strikethrough",
    "==": "Highlight",
    "`": "InlineCode",
  }[marker];
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (
      node.name === kind &&
      state.sliceDoc(node.from, node.from + marker.length) === marker &&
      state.sliceDoc(node.to - marker.length, node.to) === marker &&
      position >= node.from + marker.length &&
      position <= node.to - marker.length
    ) {
      return {
        changes: [
          { from: node.from, to: node.from + marker.length },
          { from: node.to - marker.length, to: node.to },
        ],
        range: EditorSelection.cursor(position - marker.length),
      };
    }
    node = node.parent;
  }
  return undefined;
}

function toggleSelectedText(
  state: EditorState,
  range: SelectionRange,
  marker: string,
) {
  const selected = state.sliceDoc(range.from, range.to);
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
      range: EditorSelection.range(range.from, range.to - marker.length * 2),
    };
  }
  if (
    state.sliceDoc(Math.max(0, range.from - marker.length), range.from) ===
      marker &&
    state.sliceDoc(range.to, range.to + marker.length) === marker
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
}
