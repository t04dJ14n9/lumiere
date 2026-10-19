import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { PasteData } from "./api";
export function acceptsHtml(state: EditorState): boolean {
  let node = syntaxTree(state).resolveInner(state.selection.main.from, 1);
  for (;;) {
    if (["FencedCode", "CodeBlock", "InlineCode"].includes(node.name)) {
      return false;
    }
    if (!node.parent) {
      return true;
    }
    node = node.parent;
  }
}
/** Async transforms must never overwrite a later keystroke, caret move or closed cell. */
export async function pasteTransformed(options: {
  view: EditorView;
  data: PasteData;
  transform(data: PasteData): Promise<PasteData>;
  isLive(): boolean;
}): Promise<boolean> {
  const { view, data, transform, isLive } = options;
  const before = view.state;
  const result = await transform(data);
  if (
    !isLive() ||
    view.state.doc !== before.doc ||
    !view.state.selection.eq(before.selection)
  ) {
    return false;
  }
  view.dispatch({
    ...view.state.replaceSelection(result.text),
    userEvent: "input.paste",
    scrollIntoView: true,
  });
  return true;
}
