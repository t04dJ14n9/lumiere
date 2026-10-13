import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import { installCellWordNavigation } from "../../src/plugins/tables/word-navigation";
import { installVimKeyRouting } from "../../src/plugins/vim/key-routing";

function buffer(text: string) {
  let state = EditorState.create({ doc: text });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    contentDOM: new EventTarget(),
    dispatch(...specs: TransactionSpec[]) {
      state = state.update(...specs).state;
    },
  } as unknown as EditorView;
  const cm = new CodeMirror(view);
  Object.defineProperty(cm, "openDialog", { value: undefined });
  Vim.maybeInitVimState_(cm);
  return { view, cm };
}

for (const sequence of ["ggx", "ggG", "gg2Gx"]) {
  for (const origin of ["mapping", "macro"] as const) {
    test(`${origin} ${sequence} hands subsequent commands to the outer buffer synchronously`, () => {
      const outer = buffer("Above\nMiddle\nBelow");
      const cell = buffer("alpha");
      const original = Vim.findKey;
      const routing = installVimKeyRouting();
      let release = () => {};
      const navigation = installCellWordNavigation(
        cell.view,
        cell.cm,
        () => false,
        (target) => {
          release = routing.handoff(cell.cm, outer.cm);
          outer.cm.setCursor(target === "last" ? 2 : target - 1, 0);
          return true;
        },
      );
      const register = Vim.getRegisterController().getRegister("a");
      try {
        if (origin === "mapping") {
          Vim.map("Q", sequence, "normal");
          Vim.handleKey(cell.cm, "Q", "user");
        } else {
          register.keyBuffer.push(...sequence);
          Vim.handleKey(cell.cm, "@", "user");
          Vim.handleKey(cell.cm, "a", "user");
        }
        const expected = new Map([
          ["ggx", { text: "bove\nMiddle\nBelow", line: 0 }],
          ["ggG", { text: "Above\nMiddle\nBelow", line: 2 }],
          ["gg2Gx", { text: "Above\niddle\nBelow", line: 1 }],
        ]).get(sequence)!;
        assert.equal(cell.view.state.doc.toString(), "alpha");
        assert.equal(outer.view.state.doc.toString(), expected.text);
        assert.equal(outer.cm.getCursor().line, expected.line);
        assert.equal(cell.cm.state.vim?.inputState.keyBuffer.length, 0);
        release();
        Vim.handleKey(cell.cm, "x", "user");
        assert.equal(cell.view.state.doc.toString(), "lpha");
        assert.equal(outer.view.state.doc.toString(), expected.text);
      } finally {
        Vim.unmap("Q", "normal");
        register.clear();
        navigation.destroy();
        release();
        routing.destroy();
      }
      assert.equal(Vim.findKey, original);
    });
  }
}

test("routing leaves other adapters alone and preserves live panels on out-of-order disposal", () => {
  const original = Vim.findKey;
  const first = installVimKeyRouting();
  const second = installVimKeyRouting();
  const cell = buffer("alpha");
  const outer = buffer("Above");
  const unrelated = buffer("Other");
  const release = second.handoff(cell.cm, outer.cm);
  try {
    first.destroy();
    Vim.handleKey(cell.cm, "x", "user");
    assert.equal(outer.view.state.doc.toString(), "bove");
    assert.equal(cell.view.state.doc.toString(), "alpha");
    Vim.handleKey(unrelated.cm, "x", "user");
    assert.equal(unrelated.view.state.doc.toString(), "ther");
    second.destroy();
    assert.equal(Vim.findKey, original);
    Vim.handleKey(cell.cm, "x", "user");
    assert.equal(cell.view.state.doc.toString(), "lpha");
  } finally {
    release();
    second.destroy();
    first.destroy();
    Vim.findKey = original;
  }
});
