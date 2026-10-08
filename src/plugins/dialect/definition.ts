import type { Plugin } from "../../kernel";
import { markdownParser, markdownLanguageSupport } from "../../markdown/dialect";
import { metadata } from "../../markdown/metadata";
import { createRenderer } from "../../markdown/html";
import type {} from "./api";
export const dialect: Plugin = {
  name: "dialect",
  apply(ctx) {
    ctx.provide("markdown", {
      parser: markdownParser,
      language: markdownLanguageSupport,
      metadata,
      renderer: createRenderer(),
    });
  },
};
