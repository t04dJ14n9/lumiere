import type { MarkdownIt } from "markdown-it";
import { highlightEmphasisFlags } from "../dialect/highlight-emphasis";

/** Feed highlight-aware asterisk runs into markdown-it's emphasis pairing. */
export function highlightEmphasis(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "highlight_emphasis", (state, silent) => {
    if (silent || state.src.charCodeAt(state.pos) !== 42) {
      return false;
    }
    const { length } = state.scanDelims(state.pos, true);
    const flags = highlightEmphasisFlags(
      state.src,
      state.pos,
      state.pos + length,
    );
    if (!flags) {
      return false;
    }
    for (let index = 0; index < length; index++) {
      const token = state.push("text", "", 0);
      token.content = "*";
      state.delimiters.push({
        marker: 42,
        length,
        token: state.tokens.length - 1,
        end: -1,
        open: flags.open,
        close: flags.close,
      });
    }
    state.pos += length;
    return true;
  });
}
