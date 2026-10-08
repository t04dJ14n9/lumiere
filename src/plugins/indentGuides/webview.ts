import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";

export function indentation(text: string, tabSize: number): number {
  let width = 0;
  for (const char of text) {
    if (char === " ") width++;
    else if (char === "\t") width += tabSize - (width % tabSize);
    else break;
  }
  return width;
}
function guides(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const visible of view.visibleRanges) {
    for (let at = visible.from; at <= visible.to; ) {
      const line = view.state.doc.lineAt(at);
      const width = indentation(line.text, view.state.tabSize);
      if (width)
        ranges.push(
          Decoration.line({
            attributes: {
              style: `--indent-width:${width}ch;--indent-step:${view.state.tabSize}ch`,
              class: "mw-indent-guide",
            },
          }).range(line.from),
        );
      at = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}
export const indentGuidesWebview: Plugin = {
  name: "indentGuides",
  inject: { required: ["editor"] },
  apply(ctx) {
    ctx.effect(() =>
      ctx.editor.extend([
        ViewPlugin.define(
          (view) => ({
            decorations: guides(view),
            update(update) {
              this.decorations = guides(update.view);
            },
          }),
          { decorations: (value) => value.decorations },
        ),
        EditorView.baseTheme({
          ".mw-indent-guide": {
            backgroundImage:
              "repeating-linear-gradient(to right, transparent 0, transparent calc(var(--indent-step) - 1px), var(--vscode-editorIndentGuide-background1, #7774) calc(var(--indent-step) - 1px), var(--vscode-editorIndentGuide-background1, #7774) var(--indent-step))",
            backgroundSize: "var(--indent-width) 100%",
            backgroundRepeat: "no-repeat",
          },
        }),
      ]),
    );
  },
};
