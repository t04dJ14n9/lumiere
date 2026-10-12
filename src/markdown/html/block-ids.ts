import type { MarkdownIt } from "markdown-it";
import type { Token } from "markdown-it";
export function blockids(md: MarkdownIt): void {
  md.core.ruler.after("inline", "block-ids", (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]!;
      if (
        token.type !== "inline" ||
        state.tokens[index - 1]?.type !== "paragraph_open"
      ) {
        continue;
      }
      attachBlockId(token, state.tokens[index - 1]!, state.tokens[index + 1]!);
    }
  });
}

function attachBlockId(inline: Token, opening: Token, closing: Token): void {
  const last = inline.children?.at(-1);
  if (last?.type !== "text") {
    return;
  }
  const id = /(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*$/.exec(last.content);
  if (!id) {
    return;
  }
  last.content = last.content.slice(0, id.index);
  opening.attrSet("id", `block-${id[1]}`);
  if (inline.children!.every((child) => !child.content)) {
    opening.hidden = true;
    closing.hidden = true;
  }
}
