import type MarkdownIt from "markdown-it";
import { headingId } from "./helpers";
export function headings(md: MarkdownIt): void {
  md.core.ruler.after("inline", "headings", (state) => {
    const headingCounts = new Map<string, number>();
    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]!;
      if (token.type === "heading_open") {
        const inline = state.tokens[index + 1]!;
        const text = (inline.children ?? [])
          .filter((child) => child.type !== "html_inline")
          .map((child) => child.content)
          .join("");
        const base = headingId(text),
          count = headingCounts.get(base) ?? 0;
        headingCounts.set(base, count + 1);
        token.attrSet("id", base + (count ? `-${count}` : ""));
        token.attrSet("data-heading", text);
      }
    }
  });
}
