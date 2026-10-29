import type { Plugin } from "@workshop/core";
import { markdownParser } from "../../markdown/dialect/parser";
import { markdownLanguageSupport } from "../../markdown/dialect/language";
import { createRenderer, type RendererOptions } from "../../markdown/html";
import type {} from "./api";

/**
 * Webview dialect: parser, CM language and HTML renderer. Full-document
 * metadata extraction (which pulls in the YAML runtime) stays out of the
 * initial editor bundle until lazy feature chunks load.
 */
export function dialectPlugin(options: RendererOptions = {}): Plugin {
  return {
    name: "dialect",
    provides: ["markdown"],
    apply(ctx) {
      ctx.provide("markdown", {
        parser: markdownParser,
        language: markdownLanguageSupport,
        metadata: () => {
          throw new Error(
            "markdown.metadata is not available on the core dialect service",
          );
        },
        renderer: createRenderer(options),
      });
    },
  };
}
