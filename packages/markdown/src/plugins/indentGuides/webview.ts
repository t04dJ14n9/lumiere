import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Plugin } from "@workshop/core";
import type {} from "../editor/api";
import type {} from "../livePreview/api";
import { guideDecorations, syncListActiveGuide } from "./guides";

export const indentGuidesWebview: Plugin = {
  name: "indentGuides",
  inject: { required: ["editor"], optional: ["livePreview"] },
  apply(ctx) {
    const isLivePreview = () => ctx.livePreview?.mode === "livePreview";
    const guides = (view: EditorView) =>
      guideDecorations(view.state, view.visibleRanges, isLivePreview());
    ctx.effect(() =>
      ctx.editor.extend([
        EditorView.editorAttributes.of({ class: "mw-indent-guides" }),
        ViewPlugin.define(
          (view) => {
            syncListActiveGuide(view.dom, view.state, isLivePreview());
            return {
              decorations: guides(view),
              update(update) {
                this.decorations = guides(update.view);
                if (
                  update.docChanged ||
                  update.selectionSet ||
                  update.viewportChanged
                ) {
                  syncListActiveGuide(
                    update.view.dom,
                    update.view.state,
                    isLivePreview(),
                  );
                }
              },
              destroy() {
                syncListActiveGuide(view.dom, view.state, false);
              },
            };
          },
          { decorations: (value) => value.decorations },
        ),
      ]),
    );
  },
};
