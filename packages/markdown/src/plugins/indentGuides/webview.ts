import { EditorView, ViewPlugin } from "@codemirror/view";
import type { Plugin } from "@workshop/core";
import type {} from "../editor/api";
import { documentTree, type LivePreview } from "../livePreview/api";
import { guideDecorations, syncListActiveGuide } from "./guides";

export const indentGuidesWebview: Plugin = {
  name: "indentGuides",
  inject: { required: ["editor"], optional: ["livePreview"] },
  apply(ctx) {
    const isLivePreview = () =>
      (ctx.livePreview as LivePreview | undefined)?.mode === "livePreview";
    const guides = (view: EditorView) =>
      guideDecorations(view.state, view.visibleRanges, isLivePreview());
    ctx.effect(() =>
      ctx.editor.extend([
        EditorView.editorAttributes.of({ class: "mw-indent-guides" }),
        ViewPlugin.define(
          (view) => {
            let lastMode = isLivePreview();
            syncListActiveGuide(view.dom, view.state, lastMode);
            return {
              decorations: guides(view),
              update(update) {
                const mode = isLivePreview();
                const modeChanged = mode !== lastMode;
                lastMode = mode;
                const treeChanged =
                  update.startState.field(documentTree, false) !==
                  update.state.field(documentTree, false);
                if (
                  modeChanged ||
                  update.docChanged ||
                  update.viewportChanged ||
                  treeChanged
                ) {
                  this.decorations = guides(update.view);
                }
                if (
                  modeChanged ||
                  update.docChanged ||
                  update.selectionSet ||
                  treeChanged
                ) {
                  syncListActiveGuide(update.view.dom, update.view.state, mode);
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
