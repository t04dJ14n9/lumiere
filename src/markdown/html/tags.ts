import type MarkdownIt from "markdown-it";
import { attr, escape } from "./helpers";
import { readTag } from "../tags/grammar";
export function tags(md: MarkdownIt): void {
  const tagButton = (tag: string): string =>
    `<button type="button" class="md-tag"${attr("data-tag", tag)}${attr("aria-label", `Search tag #${tag}`)}>#${escape(tag)}</button>`;
  md.inline.ruler.before("text", "tag", (state, silent) => {
    const tag = readTag(state.src, state.pos);
    if (!tag) {
      return false;
    }
    if (!silent) {
      const token = state.push("tag", "", 0);
      token.content = tag;
    }
    state.pos += tag.length + 1;
    return true;
  });
  md.renderer.rules.tag = (tokens, index) => tagButton(tokens[index]!.content);
}
