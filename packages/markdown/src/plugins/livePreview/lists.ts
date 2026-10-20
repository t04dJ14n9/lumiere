import { WidgetType } from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import type { InlineContext } from "./api";

/** A rendered bullet; it stands in for the marker and the space after it. */
class Bullet extends WidgetType {
  override eq(): boolean {
    return true;
  }
  override toDOM(): HTMLElement {
    const bullet = document.createElement("span");
    bullet.textContent = "•";
    bullet.className = "list-bullet";
    return bullet;
  }
}

/** A list item's indentation, drawn as fixed steps independent of source spacing. */
class ListIndent extends WidgetType {
  constructor(readonly depth: number) {
    super();
  }
  override eq(other: ListIndent): boolean {
    return other.depth === this.depth;
  }
  override toDOM(): HTMLElement {
    const indent = document.createElement("span");
    indent.className = "md-list-indent";
    indent.style.setProperty("--list-depth", String(this.depth));
    return indent;
  }
}

/** How many lists enclose a list item, minus one: 0 for a top-level item. */
export function listDepth(item: SyntaxNode): number {
  let depth = -1;
  for (let node: SyntaxNode | null = item; node; node = node.parent) {
    if (node.name === "BulletList" || node.name === "OrderedList") {
      depth++;
    }
  }
  return Math.max(0, depth);
}

/**
 * The hanging-indent width of an item's marker, as a CSS length: where the
 * item's text starts, as measured in Obsidian (23px for a bullet, 30px for
 * a number of any width, 27px for a task, at 16px).
 */
export function markerWidth(marker: string, isTask: boolean): string {
  if (isTask) {
    return "calc(1.75em - 1px)";
  }
  if (/^[-+*]$/.test(marker)) {
    return "calc(1.25em + 3px)";
  }
  return "calc(1.5em + 6px)";
}

/**
 * List items as in Obsidian: each nesting level is a fixed indent step with
 * muted markers, and wrapped text hangs under the item's text.
 * Items inside quotes keep the quote's own layout.
 */
export function decorateListItem(node: SyntaxNodeRef, cx: InlineContext): void {
  const mark = node.node.getChild("ListMark");
  if (node.name !== "ListItem" || !mark) {
    return;
  }
  const line = cx.state.doc.lineAt(node.from);
  const leading = cx.state.sliceDoc(line.from, node.from);
  if (/\S/.test(leading) || line.from !== cx.state.doc.lineAt(mark.from).from) {
    return;
  }
  const depth = listDepth(node.node);
  const text = cx.state.sliceDoc(mark.from, mark.to);
  const isTask = Boolean(mark.nextSibling?.getChild("TaskMarker"));
  const style = `--list-depth: ${depth}; --list-marker: ${markerWidth(text, isTask)}`;
  cx.line(line.from, "md-list-line", { style });
  if (leading.length > 0) {
    cx.replace(line.from, node.from, new ListIndent(depth));
  }
  decorateMarker(cx, mark, text, isTask);
  decorateContinuations(node.node, cx, style);
}

/**
 * An item's indented continuation lines, as in Obsidian 1.14 (measured):
 * spaces up to the item's text column hang under that text (hidden); a lazy
 * line, with none, stays at the margin. Extra spaces beyond the content
 * column are placed by Obsidian's indent-size steps alone (REA
 * `HyperMD-list-line-nobullet` + `cm-indent` min-width `--list-indent`, last
 * spacing `--list-indent-editing` + `--list-marker-space`), not by hanging
 * under the parent and showing the leftover spaces.
 */
/** Obsidian `--indent-size` (REA app.css). */
const INDENT_SIZE = 4;
/** Obsidian LP nobullet last-indent padding: 0.75em + 0.25em. */
const CONTINUATION_SPACES_MARKER = "1em";

function decorateContinuations(
  item: SyntaxNode,
  cx: InlineContext,
  style: string,
): void {
  const first = cx.state.doc.lineAt(item.from);
  const content = contentColumn(cx.state.sliceDoc(first.from, first.to));
  for (let child = item.firstChild; child; child = child.nextSibling) {
    // A task item's paragraph is a Task node.
    if (child.name !== "Paragraph" && child.name !== "Task") {
      continue;
    }
    let line = cx.state.doc.lineAt(child.from);
    while (line.from <= child.to) {
      const spaces = /^[ \t]*/.exec(line.text)![0].length;
      if (line.from !== first.from && spaces > 0) {
        if (spaces > content) {
          const steps = Math.max(1, Math.floor(spaces / INDENT_SIZE));
          const spaceStyle = `--list-depth: ${steps}; --list-marker: ${CONTINUATION_SPACES_MARKER}`;
          cx.line(line.from, "md-list-line md-list-continuation", {
            style: spaceStyle,
          });
          cx.hide(line.from, line.from + spaces);
        } else {
          cx.line(line.from, "md-list-line md-list-continuation", { style });
          cx.hide(line.from, line.from + spaces);
        }
      }
      if (line.number === cx.state.doc.lines) {
        break;
      }
      line = cx.state.doc.line(line.number + 1);
    }
  }
}

/** Where an item's text starts on its first line, in characters. */
function contentColumn(text: string): number {
  return (
    /^\s*(?:[-+*]|\d+[.)])[ \t]*(?:\[.\][ \t]*)?/.exec(text)?.[0].length ?? 0
  );
}

function decorateMarker(
  cx: InlineContext,
  mark: SyntaxNode,
  text: string,
  isTask: boolean,
): void {
  const end = Math.min(
    mark.to + (cx.state.sliceDoc(mark.to, mark.to + 1) === " " ? 1 : 0),
    cx.state.doc.length,
  );
  if (!/^[-+*]$/.test(text)) {
    cx.mark(mark.from, end, "md-list-number");
    return;
  }
  const task = mark.nextSibling?.getChild("TaskMarker");
  if (isTask && task) {
    if (!cx.revealed(mark.from, task.to)) {
      cx.hide(mark.from, task.from);
    }
    return;
  }
  if (!cx.revealed(mark.from, mark.to)) {
    cx.replace(mark.from, end, new Bullet());
    return;
  }
  // Revealed, as in Obsidian: a dim `-` in the bullet's place, so the text
  // keeps its indent.
  cx.mark(mark.from, end, "md-list-mark-source");
}
