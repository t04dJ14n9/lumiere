import type MarkdownIt from "markdown-it";
import { attr, escape } from "./helpers";
export function math(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "math", (state, silent) => {
    if (state.src[state.pos] !== "$") {
      return false;
    }
    const delimiter = state.src.startsWith("$$", state.pos) ? "$$" : "$";
    const start = state.pos + delimiter.length;
    if (/\s/.test(state.src[start] ?? "") && delimiter === "$") {
      return false;
    }
    let end = start;
    do {
      end = state.src.indexOf(delimiter, end + 1);
    } while (end >= 0 && state.src[end - 1] === "\\");
    if (end < 0 || (/\s/.test(state.src[end - 1] ?? "") && delimiter === "$")) {
      return false;
    }
    if (!silent) {
      const token = state.push(delimiter === "$$" ? "math_block" : "math_inline", "", 0);
      token.content = state.src.slice(start, end);
    }
    state.pos = end + delimiter.length;
    return true;
  });
  const mathHTML = (expression: string, display: boolean): string =>
    `<span class="math-placeholder${display ? " math-display" : ""}"${attr("data-math", encodeURIComponent(expression))}${attr("data-display", String(display))}>${escape(expression)}</span>`;
  md.renderer.rules.math_inline = (tokens, index) => mathHTML(tokens[index]!.content, false);
  md.renderer.rules.math_block = (tokens, index) => mathHTML(tokens[index]!.content, true);

  md.block.ruler.before(
    "fence",
    "math_block",
    (state, start, end, silent) => {
      const first = state.src.slice(
        state.bMarks[start]! + state.tShift[start]!,
        state.eMarks[start],
      );
      if (!first.startsWith("$$") || state.sCount[start]! - state.blkIndent >= 4) {
        return false;
      }
      let last = start,
        content = first.slice(2),
        closing = content.indexOf("$$");
      while (closing < 0 && last + 1 < end) {
        last++;
        const line = state.src.slice(state.bMarks[last]! + state.tShift[last]!, state.eMarks[last]);
        const found = line.indexOf("$$");
        if (found >= 0) {
          content += "\n" + line.slice(0, found);
          closing = content.length;
        } else {
          content += "\n" + line;
        }
      }
      if (closing < 0) {
        return false;
      }
      if (silent) {
        return true;
      }
      const token = state.push("math_block", "", 0);
      token.block = true;
      token.content = content.slice(0, closing).trim();
      token.map = [start, last + 1];
      state.line = last + 1;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
}
