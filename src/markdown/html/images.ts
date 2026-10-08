import type MarkdownIt from "markdown-it";
import { attr, wikiTarget } from "./helpers";
export function images(md: MarkdownIt): void {
  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index]!;
    const raw = token.attrGet("src") ?? "";
    const size = wikiTarget(`image|${token.content.split("|").at(-1) ?? ""}`);
    const altText = size.width
      ? token.content.replace(/\|?\d+(?:x\d+)?$/, "")
      : token.content;
    return `<img class="note-image"${attr("data-resource", raw)}${attr("alt", altText)}${attr("title", token.attrGet("title") ?? undefined)}${attr("width", size.width)}${attr("height", size.height)} loading="lazy">`;
  };
}
