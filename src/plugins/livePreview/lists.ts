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

/** A list item's indentation, drawn as fixed steps with an indent guide each. */
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

/** The hanging-indent width of an item's marker, as a CSS length. */
export function markerWidth(marker: string, isTask: boolean): string {
  if (isTask) {
    return "calc(21px + 0.3em)";
  }
  if (/^[-+*]$/.test(marker)) {
    return "1.1em";
  }
  return `${marker.length + 1}ch`;
}

/**
 * List items as in Obsidian: each nesting level is a fixed indent step with
 * a guide, markers are muted, and wrapped text hangs under the item's text.
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
  cx.line(line.from, "md-list-line", {
    style: `--list-depth: ${depth}; --list-marker: ${markerWidth(text, isTask)}`,
  });
  if (leading.length > 0) {
    cx.replace(line.from, node.from, new ListIndent(depth));
  }
  decorateMarker(cx, mark, text, isTask);
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
