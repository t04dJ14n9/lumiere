import type { markdownParser } from "../../markdown/dialect/parser";
import type { markdownLanguageSupport } from "../../markdown/dialect/language";
import type { metadata } from "../../markdown/metadata";
import type { createRenderer } from "../../markdown/html";
export interface MarkdownService {
  parser: typeof markdownParser;
  language: typeof markdownLanguageSupport;
  metadata: typeof metadata;
  renderer: ReturnType<typeof createRenderer>;
}
declare module "@workshop/core" {
  interface Services {
    markdown: MarkdownService;
  }
}
