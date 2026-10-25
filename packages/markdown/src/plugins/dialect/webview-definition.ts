import type { Plugin } from "@workshop/core";
import { markdownParser } from "../../markdown/dialect/parser";
import { markdownLanguageSupport } from "../../markdown/dialect/language";
import { metadata } from "../../markdown/metadata";
import { createRenderer, type RendererOptions } from "../../markdown/html";
import type {} from "./api";

/** Webview dialect: parser, CM language, metadata and HTML renderer. */
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
