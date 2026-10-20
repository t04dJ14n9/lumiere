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

/**
 * 0-based list guide column for the caret in Live Preview, matching Obsidian's
 * active indent on nested lists. Top-level items (depth 0) paint no guides.
 */
/** Nesting depth of a list item (0 = top-level). Kept local to respect plugin boundaries. */
function listDepth(item: { name?: string; parent: unknown }): number {
  let depth = -1;
  for (
    let node: { name?: string; parent: unknown } | null = item;
    node;
    node = node.parent as { name?: string; parent: unknown } | null
  ) {
    if (node.name === "BulletList" || node.name === "OrderedList") {
      depth++;
    }
  }
  return Math.max(0, depth);
}

export function activeListGuideColumn(state: EditorState): number | undefined {
  const head = state.selection.main.head;
  const tree = parseMarkdown(state.doc);
  let item = null;
  for (
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
      head,
      1,
    );
    node;
    node = node.parent
  ) {
    if (["CodeBlock", "FencedCode"].includes(node.name)) {
      return undefined;
    }
    if (node.name === "ListItem") {
      item = node;
      break;
    }
  }
  if (!item) {
    return undefined;
  }
  const depth = listDepth(item);
  return depth >= 1 ? depth - 1 : undefined;
}

/** Apply / clear `--list-active-depth` on the editor root for LP list guides. */
export function syncListActiveGuide(
  dom: HTMLElement,
  state: EditorState,
  isLivePreview: boolean,
): void {
  const column = isLivePreview ? activeListGuideColumn(state) : undefined;
  if (column === undefined) {
    dom.style.removeProperty("--list-active-depth");
    dom.classList.remove("mw-list-active-guide");
    return;
  }
  dom.style.setProperty("--list-active-depth", String(column));
  dom.classList.add("mw-list-active-guide");
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
