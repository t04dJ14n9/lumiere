import type { EditorView } from "@codemirror/view";

type CmLike = {
  cm?: {
    state?: {
      vim?: {
        insertMode?: boolean;
      };
    };
  };
};

/**
 * Inspect whether a CodeMirror view is currently in Vim insert mode without
 * statically importing @replit/codemirror-vim into the core editor bundle.
 */
export function isVimInsertMode(view: EditorView): boolean {
  return Boolean((view as unknown as CmLike).cm?.state?.vim?.insertMode);
}

let insertCtrlWHandler: ((view: EditorView) => void) | undefined;
let listContinueHandler: ((view: EditorView) => boolean) | undefined;

export function setVimInsertCtrlWHandler(
  handler: ((view: EditorView) => void) | undefined,
): () => void {
  insertCtrlWHandler = handler;
  return () => {
    if (insertCtrlWHandler === handler) {
      insertCtrlWHandler = undefined;
    }
  };
}

export function runVimInsertCtrlW(view: EditorView): void {
  insertCtrlWHandler?.(view);
}

export function setVimListContinueHandler(
  handler: ((view: EditorView) => boolean) | undefined,
): () => void {
  listContinueHandler = handler;
  return () => {
    if (listContinueHandler === handler) {
      listContinueHandler = undefined;
    }
  };
}

export function getVimListContinueHandler():
  | ((view: EditorView) => boolean)
  | undefined {
  return listContinueHandler;
}
