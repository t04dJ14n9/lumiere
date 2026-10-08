import type MarkdownIt from "markdown-it";
import type { RenderRule } from "markdown-it/lib/renderer.mjs";
import { escape } from "./helpers";
import type { RenderOptions } from "./types";
export function html(md: MarkdownIt): void {
  md.renderer.rules.html_inline = guardedHTML(md.renderer.rules.html_inline!);
  md.renderer.rules.html_block = guardedHTML(md.renderer.rules.html_block!);
}

/** Raw HTML is enabled only when the caller will sanitize the result. */
function guardedHTML(render: RenderRule): RenderRule {
  return (...args) => {
    const [tokens, index, , environment] = args;
    const options = environment as RenderOptions;
    return options.sanitize ? render(...args) : escape(tokens[index]!.content);
  };
}
