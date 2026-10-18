import type { MarkdownIt } from "markdown-it";
import { highlightColourAt } from "../dialect/highlight";

/**
 * Coloured highlights, as Obsidian 1.14 renders them: `==🔵text==` becomes
 * `<mark data-highlight="blue">text</mark>`, the emoji dropped.
 */
export function highlights(md: MarkdownIt): void {
  md.core.ruler.after("inline", "highlight_colour", (state) => {
    for (const block of state.tokens) {
      const children = block.children ?? [];
      children.forEach((token, index) => {
        const text = children[index + 1];
        if (token.type !== "mark_open" || text?.type !== "text") {
          return;
        }
        const colour = highlightColourAt(text.content);
        if (colour) {
          token.attrSet("data-highlight", colour);
          text.content = text.content.slice(2);
        }
      });
    }
  });
}
