import type MarkdownIt from "markdown-it";
import { attr } from "./helpers";
export function tasks(md: MarkdownIt): void {
  md.core.ruler.after("inline", "tasks", (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]!;
      if (
        token.type === "inline" &&
        state.tokens[index - 2]?.type === "list_item_open"
      ) {
        const first = token.children?.[0];
        const task =
          first?.type === "text" ? /^\[([^\]])\] /.exec(first.content) : null;
        if (task && first) {
          const checkbox = new state.Token("html_inline", "", 0);
          checkbox.content = `<input type="checkbox"${attr("data-task", task[1])}${attr("data-line", token.map?.[0])} aria-label="Task"${task[1] === " " ? "" : " checked"}> `;
          const label = new state.Token("html_inline", "", 0);
          const endLabel = new state.Token("html_inline", "", 0);
          label.content = '<span class="task-label">';
          endLabel.content = "</span>";
          first.content = first.content.slice(task[0].length);
          token.children!.unshift(checkbox, label);
          token.children!.push(endLabel);
          state.tokens[index - 2]!.attrJoin("class", "task-list-item");
          state.tokens[index - 2]!.attrSet("data-task", task[1]!);
        }
      }
    }
  });
}
