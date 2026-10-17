import assert from "node:assert/strict";
import test from "node:test";
import {
  EditorSelection,
  EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import {
  installKeepInsertExitCaret,
  shouldRestoreInsertExitCaret,
} from "./leave-insert";

test("shouldRestoreInsertExitCaret only on insert→normal with a moved caret", () => {
  const saved = EditorSelection.single(5);
  assert.equal(
    shouldRestoreInsertExitCaret({
      wasInsert: true,
      mode: "normal",
      saved,
      current: EditorSelection.single(4),
      docLength: 20,
    }),
    true,
  );
  assert.equal(
    shouldRestoreInsertExitCaret({
      wasInsert: true,
      mode: "normal",
      saved,
      current: saved,
      docLength: 20,
    }),
    false,
  );
  assert.equal(
    shouldRestoreInsertExitCaret({
      wasInsert: false,
      mode: "normal",
      saved,
      current: EditorSelection.single(4),
      docLength: 20,
    }),
    false,
  );
  assert.equal(
    shouldRestoreInsertExitCaret({
      wasInsert: true,
      mode: "visual",
      saved,
      current: EditorSelection.single(4),
      docLength: 20,
    }),
    false,
  );
  assert.equal(
    shouldRestoreInsertExitCaret({
      wasInsert: true,
      mode: "normal",
      saved: EditorSelection.single(50),
      current: EditorSelection.single(4),
      docLength: 20,
    }),
    false,
  );
});

function fixture() {
  let state = EditorState.create({
    doc: "alpha 「…」 beta",
    selection: EditorSelection.single(0),
  });
  let updating = false;
  let destroyed = false;
  const view = {
    get state() {
      return state;
    },
    get dom() {
      return { isConnected: !destroyed };
    },
    contentDOM: new EventTarget(),
    dispatch(...specs: TransactionSpec[]) {
      assert.equal(destroyed, false, "dispatch after view destruction");
      assert.equal(updating, false, "nested EditorView update");
      const transaction = state.update(...specs);
      state = transaction.state;
      const update = {
        view,
        state,
        startState: transaction.startState,
        transactions: [transaction],
        changes: transaction.changes,
        docChanged: transaction.docChanged,
        selectionSet: Boolean(transaction.selection),
        viewportChanged: false,
        viewportMoved: false,
        heightChanged: false,
        geometryChanged: transaction.docChanged,
        focusChanged: false,
      } as ViewUpdate;
      updating = true;
      try {
        if (update.docChanged) {
          cm.onChange(update);
        }
        if (update.selectionSet) {
          cm.onSelectionChange();
        }
        if (cm.curOp && !cm.curOp.isVimOp) {
          cm.onBeforeEndOperation();
        }
        plugin.update(update);
      } finally {
        updating = false;
      }
    },
  } as unknown as EditorView;
  const cm = new CodeMirror(view);
  (view as EditorView & { cm: CodeMirror }).cm = cm;
  cm.scrollIntoView = () => {};
  cm.charCoords = (pos) => ({
    left: pos.ch * 10,
    top: pos.line * 20,
    bottom: pos.line * 20 + 20,
  });
  cm.findPosV = (pos, amount) => ({
    line: Math.max(0, Math.min(state.doc.lines - 1, pos.line + amount)),
    ch: pos.ch,
  });
  Vim.enterVimMode(cm);
  let plugin = installKeepInsertExitCaret(view, cm);
  return {
    view,
    cm,
    key(key: string) {
      cm.operation(() => {
        cm.curOp!.isVimOp = true;
        Vim.handleKey(cm, key, "user");
      });
    },
    reinstall() {
      plugin.destroy();
      plugin = installKeepInsertExitCaret(view, cm);
    },
    destroy() {
      plugin.destroy();
      Vim.leaveVimMode(cm);
      destroyed = true;
    },
  };
}

test("Esc from insert keeps the insert-mode column (CJK mid-line)", async () => {
  const f = fixture();
  const insertAt = 8; // inside 「…」
  f.view.dispatch({ selection: EditorSelection.single(insertAt) });
  f.key("i");
  assert.equal(f.cm.state.vim?.insertMode, true);
  assert.equal(f.view.state.selection.main.head, insertAt);
  f.key("<Esc>");
  await new Promise<void>((r) => queueMicrotask(r));
  assert.equal(f.cm.state.vim?.insertMode, false);
  assert.equal(
    f.view.state.selection.main.head,
    insertAt,
    "Esc must not left-shift off the insert column",
  );
  f.destroy();
});

test("R → type → Esc keeps the classic left-shift onto the replaced character", async () => {
  const f = fixture();
  const replaceAt = 7;
  try {
    f.view.dispatch({ selection: EditorSelection.single(replaceAt) });
    f.key("R");
    assert.equal(f.cm.state.vim?.insertMode, true);
    assert.equal(f.cm.state.overwrite, true);
    f.cm.overWriteSelection("x");
    assert.equal(f.view.state.selection.main.head, replaceAt + 1);
    f.key("<Esc>");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(f.cm.state.vim?.insertMode, false);
    assert.equal(f.view.state.selection.main.head, replaceAt);
    f.key("v");
    assert.equal(
      f.view.state.sliceDoc(
        f.view.state.selection.main.from,
        f.view.state.selection.main.to,
      ),
      "x",
    );
  } finally {
    f.destroy();
  }
});

test("installing in Replace does not classify its insertMode flag as Insert", async () => {
  const f = fixture();
  try {
    f.view.dispatch({ selection: EditorSelection.single(7) });
    f.key("R");
    f.reinstall();
    f.cm.overWriteSelection("x");
    f.key("<Esc>");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(f.view.state.selection.main.head, 7);
  } finally {
    f.destroy();
  }
});

test("switching from Insert to Replace clears the saved insert column", async () => {
  const f = fixture();
  try {
    f.view.dispatch({ selection: EditorSelection.single(7) });
    f.key("i");
    f.key("<Ins>");
    assert.equal(f.cm.state.overwrite, true);
    f.cm.overWriteSelection("x");
    f.key("<Esc>");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(f.view.state.selection.main.head, 7);
  } finally {
    f.destroy();
  }
});

test("exitInsertMode keepCursor true retains column (library contract)", () => {
  let state = EditorState.create({
    doc: "alpha 「…」 beta",
    selection: EditorSelection.single(8),
  });
  const view = {
    get state() {
      return state;
    },
    contentDOM: new EventTarget(),
    dispatch(...specs: TransactionSpec[]) {
      state = state.update(...specs).state;
    },
  } as unknown as EditorView;
  const cm = new CodeMirror(view);
  cm.scrollIntoView = () => {};
  Vim.enterVimMode(cm);
  Vim.handleKey(cm, "i", "user");
  assert.equal(cm.state.vim?.insertMode, true);
  Vim.exitInsertMode(cm as never, true);
  assert.equal(cm.state.vim?.insertMode, false);
  assert.equal(view.state.selection.main.head, 8);
  Vim.handleKey(cm, "i", "user");
  Vim.exitInsertMode(cm as never, false);
  assert.equal(view.state.selection.main.head, 7);
  Vim.leaveVimMode(cm);
});
