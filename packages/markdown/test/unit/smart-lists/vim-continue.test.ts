import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { ensureSyntaxTree } from "@codemirror/language";
import { CodeMirror } from "@replit/codemirror-vim";
import { markdownLanguageSupport } from "../../../src/markdown/dialect";
import { installVimListContinue } from "../../../src/plugins/smartLists/vim-continue";

function viewAt(text: string): { view: EditorView; cm: CodeMirror } {
  const head = text.indexOf("|");
  let state = EditorState.create({
    doc: text.replace("|", ""),
    selection: { anchor: head },
    extensions: [markdownLanguageSupport()],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  state = state.update({}).state;
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch(...specs: TransactionSpec[]) {
      state = state.update(...specs).state;
    },
  } as unknown as EditorView;
  return { view, cm: new CodeMirror(view) };
}

test("vim newlineAndIndentContinueComment continues an ordered list like Enter", () => {
  const stop = installVimListContinue();
  try {
    const { view, cm } = viewAt("1. Alpha\n2. Charlie|");
    CodeMirror.commands.newlineAndIndentContinueComment(cm);
    const at = view.state.selection.main.head;
    const marked = view.state.sliceDoc(0, at) + "|" + view.state.sliceDoc(at);
    assert.equal(marked, "1. Alpha\n2. Charlie\n3. |");
  } finally {
    stop();
  }
});

test("vim newlineAndIndentContinueComment falls back off a list", () => {
  const stop = installVimListContinue();
  try {
    const { view, cm } = viewAt("plain|");
    CodeMirror.commands.newlineAndIndentContinueComment(cm);
    assert.equal(view.state.doc.toString(), "plain\n");
  } finally {
    stop();
  }
});
