import type {
  BlockContext,
  LeafBlock,
  LeafBlockParser,
  MarkdownConfig,
} from "@lezer/markdown";

class TaskParser implements LeafBlockParser {
  nextLine(): boolean {
    return false;
  }
  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    cx.addLeafElement(
      leaf,
      cx.elt("Task", leaf.start, leaf.start + leaf.content.length, [
        cx.elt("TaskMarker", leaf.start, leaf.start + 3),
        ...cx.parser.parseInline(leaf.content.slice(3), leaf.start + 3),
      ]),
    );
    return true;
  }
}

/**
 * Obsidian's task list items: any single character between the brackets is a
 * status (`[/]` in progress, `[-]` cancelled, …), not only GFM's `[ ]` and
 * `[x]`. Replaces GFM's parser and keeps its `Task` and `TaskMarker` nodes.
 */
export const tasks: MarkdownConfig = {
  remove: ["TaskList"],
  parseBlock: [
    {
      name: "ObsidianTaskList",
      leaf: (cx, leaf) =>
        /^\[[^\]\n]\][ \t]/.test(leaf.content) &&
        cx.parentType().name === "ListItem"
          ? new TaskParser()
          : null,
      after: "SetextHeading",
    },
  ],
};
