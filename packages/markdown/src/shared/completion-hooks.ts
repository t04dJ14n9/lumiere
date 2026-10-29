import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

let statusFn: ((state: EditorState) => string | null) | undefined;
let moveFn: ((forward: boolean) => (view: EditorView) => boolean) | undefined;

/**
 * Register @codemirror/autocomplete hooks lazily when the suggest feature loads
 * so the core editor bundle does not pull in @codemirror/autocomplete upfront.
 */
export function registerCompletionHooks(hooks: {
  completionStatus: (state: EditorState) => string | null;
  moveCompletionSelection: (forward: boolean) => (view: EditorView) => boolean;
}): () => void {
  statusFn = hooks.completionStatus;
  moveFn = hooks.moveCompletionSelection;
  return () => {
    if (statusFn === hooks.completionStatus) {
      statusFn = undefined;
    }
    if (moveFn === hooks.moveCompletionSelection) {
      moveFn = undefined;
    }
  };
}

export function activeCompletionStatus(state: EditorState): string | null {
  return statusFn ? statusFn(state) : null;
}

export function moveActiveCompletionSelection(
  forward: boolean,
  view: EditorView,
): boolean {
  return moveFn ? moveFn(forward)(view) : false;
}
