import type MarkdownIt from "markdown-it";
import { attr, escape, wikiTarget } from "./helpers";
import type { WikiTarget } from "./helpers";
export function wiki(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wiki-link", (state, silent) => {
    const embed = state.src.startsWith("![[", state.pos);
    if (!embed && !state.src.startsWith("[[", state.pos)) {
      return false;
    }
    const start = state.pos + (embed ? 3 : 2),
      end = state.src.indexOf("]]", start);
    if (end < 0 || state.src.slice(start, end).includes("\n")) {
      return false;
    }
    if (!silent) {
      const parsed = wikiTarget(state.src.slice(start, end));
      const token = state.push(embed ? "wiki_embed" : "wiki_link", "", 0);
      token.content = parsed.label;
      token.meta = parsed;
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wiki_link = (tokens, index) => {
    const token = tokens[index]!,
      link = token.meta as WikiTarget;
    return `<a class="internal-link" data-wiki="true"${attr("href", link.target)}>${escape(link.label)}</a>`;
  };
  md.renderer.rules.wiki_embed = (tokens, index) => {
    const link = tokens[index]!.meta as WikiTarget;
    return `<span class="file-embed"${attr("data-resource", link.target)}${attr("data-width", link.width)}${attr("data-height", link.height)}>${escape(link.target)}</span>`;
  };
}
