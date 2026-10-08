import type MarkdownIt from "markdown-it";
export function comments(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "comment", (state, silent) => {
    if (!state.src.startsWith("%%", state.pos)) {
      return false;
    }
    const end = state.src.indexOf("%%", state.pos + 2);
    if (end < 0) {
      return false;
    }
    if (!silent) {
      state.push("obsidian_comment", "", 0);
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.obsidian_comment = () => "";
}
