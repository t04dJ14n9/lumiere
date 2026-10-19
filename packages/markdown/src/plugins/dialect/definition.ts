import type { Plugin } from "@workshop/core";
import {
  markdownParser,
  markdownLanguageSupport,
} from "../../markdown/dialect";
import { metadata } from "../../markdown/metadata";
import { createRenderer, type RendererOptions } from "../../markdown/html";
import type {} from "./api";
/** One dialect everywhere; only the webview's renderer draws callout icons. */
export function dialectPlugin(options: RendererOptions = {}): Plugin {
  return {
    name: "dialect",
    provides: ["markdown"],
    apply(ctx) {
      ctx.provide("markdown", {
        parser: markdownParser,
        language: markdownLanguageSupport,
        metadata,
        renderer: createRenderer(options),
      });
    },
  };
}
