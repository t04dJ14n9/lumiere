import type {
  markdownParser,
  markdownLanguageSupport,
} from "../../markdown/dialect";
import type { metadata } from "../../markdown/metadata";
import type { createRenderer } from "../../markdown/html";
export interface MarkdownService {
  parser: typeof markdownParser;
  language: typeof markdownLanguageSupport;
  metadata: typeof metadata;
  renderer: ReturnType<typeof createRenderer>;
}
declare module "../../kernel/types" {
  interface Services {
    markdown: MarkdownService;
  }
}
