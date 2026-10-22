import type { Plugin } from "@workshop/core";
import { markdownParser } from "../../markdown/dialect/parser";
import { metadata } from "../../markdown/metadata";
import type {} from "./api";

/**
 * Host dialect: parser and metadata only. LanguageSupport and the HTML
 * renderer stay out of the extension host bundle (they pull CodeMirror View
 * and markdown-it into activation).
 */
export function dialectHostPlugin(): Plugin {
  return {
    name: "dialect",
    provides: ["markdown"],
    apply(ctx) {
      ctx.provide("markdown", {
        parser: markdownParser,
        language: () => {
          throw new Error("markdown.language is only available in the webview");
        },
        metadata,
        renderer: {
          renderMarkdown: () => "",
          renderInline: () => "",
        },
      });
    },
  };
}
