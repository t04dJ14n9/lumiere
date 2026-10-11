import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
export interface VimMode {
  insertMode?: boolean;
  visualMode?: boolean;
  inputState?: {
    operator?: string | null | undefined;
    keyBuffer?: readonly string[];
    prefixRepeat?: readonly string[];
    motionRepeat?: readonly string[];
  };
}
export interface VimService {
  extension(): Extension;
  mode(view: EditorView): VimMode | undefined;
  sync(from: EditorView, to: EditorView): void;
}
declare module "../../kernel/types" {
  interface Services {
    vim: VimService;
  }
}
