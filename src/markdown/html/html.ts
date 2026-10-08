import type MarkdownIt from "markdown-it";
import { escape } from "./helpers";
import type { RenderOptions } from "./types";
export function html(md: MarkdownIt): void {
  const htmlInline = md.renderer.rules.html_inline!;
  const htmlBlock = md.renderer.rules.html_block!;
  md.renderer.rules.html_inline = (
    tokens,
    index,
    options,
    env: RenderOptions,
    self,
  ) =>
    env.sanitize
      ? htmlInline(tokens, index, options, env, self)
      : escape(tokens[index]!.content);
  md.renderer.rules.html_block = (
    tokens,
    index,
    options,
    env: RenderOptions,
    self,
  ) =>
    env.sanitize
      ? htmlBlock(tokens, index, options, env, self)
      : escape(tokens[index]!.content);
}
