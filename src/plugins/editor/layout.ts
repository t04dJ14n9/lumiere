import type { EditorView } from "@codemirror/view";

/** Layout acknowledgment is panel-RPC scoped, and expires instead of hanging hidden views. */
export function afterLayout(view: EditorView): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 1500);
    view.requestMeasure({
      read: () => true,
      write: () => {
        // The first measured write may schedule scrolling for the next frame.
        view.requestMeasure({
          read: () => true,
          write: () => {
            clearTimeout(timer);
            resolve(true);
          },
        });
      },
    });
  });
}
