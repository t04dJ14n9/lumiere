/**
 * The line decoration of a task. Any character other than a space between
 * the brackets is a checked task, as in Obsidian: its line is muted and
 * struck through. `data-task` carries the character, so a CSS snippet can
 * style custom statuses such as `[/]` or `[-]` the way Obsidian themes do.
 */
export function taskLine(status: string): {
  cls: string;
  attributes: Record<string, string>;
} {
  return {
    cls: status === " " ? "md-task-line" : "md-task-line is-checked",
    attributes: { "data-task": status },
  };
}
