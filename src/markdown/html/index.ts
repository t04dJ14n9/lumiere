// The ambient declaration must join every consuming TypeScript project.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./vendor.d.ts" />
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import { frontmatter } from "../properties";
import type { RenderOptions, RendererOptions } from "./types";
export type { RenderOptions, RendererOptions } from "./types";
export { wikiTarget, headingId, decodeMarkdownText, linkDestination } from "./helpers";
import { tags } from "./tags";
import { wiki } from "./wiki";
import { comments } from "./comments";
import { math } from "./math";
import { images } from "./images";
import { fences } from "./fences";
import { headings } from "./headings";
import { blockids } from "./block-ids";
import { tasks } from "./tasks";
import { callouts } from "./callouts";
import { html } from "./html";
export function createRenderer(options: RendererOptions = {}) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    breaks: !options.strictLineBreaks,
  })
    .use(footnote as unknown as (md: MarkdownIt) => void)
    .use(mark);
  tags(md);
  wiki(md);
  comments(md);
  math(md);
  images(md);
  fences(md);
  headings(md);
  blockids(md);
  tasks(md);
  callouts(md, options.calloutIcon);
  html(md);
  return {
    renderMarkdown(source: string, options: RenderOptions = {}): string {
      const properties = frontmatter(source);
      const html = md.render(properties ? source.slice(properties.end) : source, options);
      return options.sanitize ? options.sanitize(html) : html;
    },
    renderInline(source: string, options: RenderOptions = {}): string {
      const html = md.renderInline(source, options);
      return options.sanitize ? options.sanitize(html) : html;
    },
  };
}
