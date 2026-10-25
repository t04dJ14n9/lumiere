import type { Plugin } from "@workshop/core";
import type { ActiveEditor } from "../../shared/host";
import type { EditorPanel, Editors } from "../editor/api";
import { protocol as editorProtocol } from "../editor/protocol";
import { countText, formatCounts } from "./count";

const UPDATE_DELAY_MS = 200;
/** Do not block the status bar on a webview that is still booting (BH-018). */
const SELECTION_WAIT_MS = 50;

/** The status bar word count for the active note or its selection. */
export const wordCountHost: Plugin = {
  name: "wordCount",
  inject: {
    required: ["hostDocuments", "views", "activeEditor"],
    optional: ["editors"],
  },
  apply(ctx) {
    const status = ctx.views.status("lumiere.markdown.wordCount", 99);
    ctx.effect(() => () => status.dispose());
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    const update = async () => {
      const gen = ++generation;
      const uri = ctx.activeEditor.note();
      const text = await activeText(ctx.activeEditor, ctx.editors, uri);
      if (gen !== generation) {
        return;
      }
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
    ctx.effect(() => ctx.activeEditor.onNoteChanged(schedule));
    ctx.effect(() => ctx.activeEditor.onTextSelectionChanged(schedule));
    ctx.effect(() => ctx.hostDocuments.onChange(schedule));
    ctx.on("editor/selectionChanged", schedule);
    ctx.on("editor/opened", schedule);
    ctx.on("editor/activeChanged", schedule);
    ctx.on("editor/ready", schedule);
    void update();
  },
};

/**
 * Counts for the active note. Prefer host/panel document text so a cold
 * webview (blank for seconds on first open) cannot leave the previous note's
 * counts on the status bar. Selection is a best-effort refinement with a
 * short timeout.
 */
async function activeText(
  activeEditor: ActiveEditor,
  editors: Editors | undefined,
  uri: string | undefined = activeEditor.note(),
): Promise<ReturnType<typeof countText> | undefined> {
  if (!uri) {
    return undefined;
  }
  const panel = panelFor(editors, uri);
  if (panel) {
    return panelCounts(panel);
  }
  const editor = activeEditor.textEditor(uri);
  if (!editor) {
    return undefined;
  }
  return editor.selection
    ? countText(editor.selection, false)
    : countText(editor.text);
}

function panelFor(
  editors: Editors | undefined,
  uri: string,
): EditorPanel | undefined {
  if (!editors) {
    return undefined;
  }
  const active = editors.active();
  if (active?.document.uri === uri) {
    return active;
  }
  return editors.all().find((panel) => panel.document.uri === uri);
}

async function panelCounts(panel: EditorPanel) {
  const documentCounts = countText(panel.document.getText());
  const selection = await Promise.race([
    panel.rpc
      .call(editorProtocol, "captureSelection", {})
      .catch(() => undefined),
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), SELECTION_WAIT_MS),
    ),
  ]);
  return selection?.text ? countText(selection.text, false) : documentCounts;
}
