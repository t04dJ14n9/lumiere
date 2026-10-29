// The ambient declaration must join every consuming TypeScript project.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- markdown-it plugins have no types; see vendor.d.ts
/// <reference path="./vendor.d.ts" />
import MarkdownIt from "markdown-it";
import type { MarkdownIt as MarkdownItInstance } from "markdown-it";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import { headerParts } from "../properties/header-parts";
import type { RenderOptions, RendererOptions } from "./types";
export type { RenderOptions, RendererOptions } from "./types";
export {
  wikiTarget,
  headingId,
  decodeMarkdownText,
  linkDestination,
} from "./helpers";
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
import { highlights } from "./highlights";
import { highlightEmphasis } from "./highlight-emphasis";
export function createRenderer(options: RendererOptions = {}) {
  const defaultBreaks = !options.strictLineBreaks;
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    breaks: defaultBreaks,
  })
    .use(footnote as unknown as (md: MarkdownItInstance) => void)
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
  highlights(md);
  highlightEmphasis(md);
  return {
    renderMarkdown(source: string, options: RenderOptions = {}): string {
      md.options.breaks =
        options.strictLineBreaks === undefined
          ? defaultBreaks
          : !options.strictLineBreaks;
      const properties = options.fragment ? null : headerParts(source);
      const environment = { ...options };
      if (options.referenceDefinitions) {
        md.parse(options.referenceDefinitions, environment);
      }
      const html = md.render(
        properties ? source.slice(properties.end) : source,
        environment,
      );
      return options.sanitize ? options.sanitize(html) : html;
    },
    renderInline(source: string, options: RenderOptions = {}): string {
      md.options.breaks =
        options.strictLineBreaks === undefined
          ? defaultBreaks
          : !options.strictLineBreaks;
      const html = md.renderInline(source, { ...options });
      return options.sanitize ? options.sanitize(html) : html;
    },
  };
}
