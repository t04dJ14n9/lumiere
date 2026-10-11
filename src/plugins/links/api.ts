import type { Infer } from "../../kernel";
import type { request as requestSchema } from "./protocol";
import type { EditorView } from "@codemirror/view";
export interface LinksService {
  /** Follow the link at the focused editor's caret, including a projected cell. */
  follow(view: EditorView): boolean;
}
export type LinkRequest = Infer<typeof requestSchema> & {
  source: string;
  editorId?: string;
};
declare module "../../kernel/types" {
  interface Services {
    links: LinksService;
  }
  interface Events {
    /** @mode bail */ "links/open": (
      request: LinkRequest,
    ) => Promise<true> | undefined;
    /** @mode bail */ "link/click": (
      request: Infer<typeof requestSchema>,
    ) => true | undefined;
  }
}
