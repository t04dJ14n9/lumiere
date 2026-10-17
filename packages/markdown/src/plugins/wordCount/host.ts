import type { Plugin } from "@workshop/core";
import type { HostViews } from "../../shared/runtime";
import type { EditorPanel, Editors } from "../editor/api";
import { protocol as editorProtocol } from "../editor/protocol";
import { countText, formatCounts } from "./count";

const UPDATE_DELAY_MS = 200;

/** The status bar word count for the active note or its selection. */
export const wordCountHost: Plugin = {
  name: "wordCount",
  inject: { required: ["workshop"], optional: ["editors"] },
  apply(ctx) {
    const views = ctx.workshop.views;
    if (!views) {
      return;
    }
    const status = views.status("markdownWorkshop.wordCount", 99);
    ctx.effect(() => () => status.dispose());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = async () => {
      const text = await activeText(views, ctx.editors);
      if (text === undefined) {
        status.hide();
        return;
      }
      status.show(formatCounts(text), "Words and characters");
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void update(), UPDATE_DELAY_MS);
    };
    ctx.effect(() => () => clearTimeout(timer));
    ctx.effect(() => views.onActiveNoteChanged(schedule));
    ctx.effect(() => views.onTextSelectionChanged(schedule));
    ctx.effect(() => ctx.workshop.onChange(schedule));
    ctx.on("editor/selectionChanged", schedule);
    void update();
  },
};

/** Counts for the active note: its selection when there is one. */
async function activeText(
  views: HostViews,
  editors: Editors | undefined,
): Promise<ReturnType<typeof countText> | undefined> {
  const uri = views.activeNote();
  if (!uri) {
    return undefined;
  }
  const panel = editors?.active();
  if (panel?.document.uri === uri) {
    return panelCounts(panel);
  }
  const editor = views.textEditor(uri);
  if (!editor) {
    return undefined;
  }
  return editor.selection
    ? countText(editor.selection, false)
    : countText(editor.text);
}

async function panelCounts(panel: EditorPanel) {
  const selection = await panel.rpc
    .call(editorProtocol, "captureSelection", {})
    .catch(() => undefined);
  return selection?.text
    ? countText(selection.text, false)
    : countText(panel.document.getText());
}
