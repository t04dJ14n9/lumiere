import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
export interface VimService {
  extension(): Extension;
  mode(view: EditorView): { insertMode?: boolean } | undefined;
  sync(from: EditorView, to: EditorView): void;
}
declare module "../../kernel/types" {
  interface Services {
    vim: VimService;
  }
}
