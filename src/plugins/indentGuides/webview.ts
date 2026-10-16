import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Plugin } from "../../kernel";
import type {} from "../editor/api";
import type {} from "../livePreview/api";
import { guideDecorations } from "./guides";

export const indentGuidesWebview: Plugin = {
  name: "indentGuides",
  inject: { required: ["editor"], optional: ["livePreview"] },
  apply(ctx) {
    const guides = (view: EditorView) =>
      guideDecorations(
        view.state,
        view.visibleRanges,
        ctx.livePreview?.mode === "livePreview",
      );
    ctx.effect(() =>
      ctx.editor.extend([
        EditorView.editorAttributes.of({ class: "mw-indent-guides" }),
        ViewPlugin.define(
          (view) => ({
            decorations: guides(view),
            update(update) {
              this.decorations = guides(update.view);
            },
          }),
          { decorations: (value) => value.decorations },
        ),
      ]),
    );
  },
};
