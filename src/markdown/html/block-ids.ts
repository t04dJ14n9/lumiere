import type MarkdownIt from "markdown-it";
export function blockids(md: MarkdownIt): void {
  md.core.ruler.after("inline", "block-ids", (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]!;
      if (token.type === "inline" && state.tokens[index - 1]?.type === "paragraph_open") {
        const last = token.children?.at(-1);
        if (last?.type === "text") {
          const id = /(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*$/.exec(last.content);
          if (id) {
            last.content = last.content.slice(0, id.index);
            state.tokens[index - 1]!.attrSet("id", `block-${id[1]}`);
            if (token.children!.every((child) => !child.content)) {
              state.tokens[index - 1]!.hidden = true;
              state.tokens[index + 1]!.hidden = true;
            }
          }
        }
      }
    }
  });
}
