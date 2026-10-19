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

const sequences = [
  { keys: "ggx", text: "bove\nMiddle\nBelow", line: 0 },
  { keys: "ggG", text: "Above\nMiddle\nBelow", line: 2 },
  { keys: "gg2Gx", text: "Above\niddle\nBelow", line: 1 },
  {
    keys: "ggiZ<Esc>",
    macroKeys: "ggi<Esc>",
    inserted: "Z",
    text: "ZAbove\nMiddle\nBelow",
    line: 0,
  },
  {
    keys: "ggciwZ<Esc>",
    macroKeys: "ggciw<Esc>",
    inserted: "Z",
    text: "Z\nMiddle\nBelow",
    line: 0,
  },
  {
    keys: "ggi<Space>Z<CR>Y<Esc>",
    macroKeys: "ggi<Esc>",
    inserted: " Z\nY",
    text: " Z\nYAbove\nMiddle\nBelow",
    line: 1,
  },
];

for (const sequence of sequences) {
  for (const origin of ["mapping", "macro"] as const) {
    test(`${origin} ${sequence.keys} hands subsequent commands to the outer buffer synchronously`, () => {
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
          Vim.map("Q", sequence.keys, "normal");
          Vim.handleKey(cell.cm, "Q", "user");
        } else {
          register.keyBuffer.push(sequence.macroKeys ?? sequence.keys);
          if (sequence.inserted) {
            assert.ok(register.insertModeChanges);
            register.insertModeChanges.push({
              changes: [sequence.inserted],
              expectCursorActivityForChange: false,
            });
          }
          Vim.handleKey(cell.cm, "@", "user");
          Vim.handleKey(cell.cm, "a", "user");
        }
        assert.equal(outer.cm.state.vim?.insertMode, false);
        assert.equal(cell.view.state.doc.toString(), "alpha");
        assert.equal(outer.view.state.doc.toString(), sequence.text);
        assert.equal(outer.cm.getCursor().line, sequence.line);
        assert.equal(cell.cm.state.vim?.inputState.keyBuffer.length, 0);
        release();
        Vim.handleKey(cell.cm, "x", "user");
        assert.equal(cell.view.state.doc.toString(), "lpha");
        assert.equal(outer.view.state.doc.toString(), sequence.text);
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

test("routing preserves the horizontal goal across a blank line", () => {
  const note = buffer("abcdef\n\nabcdef");
  const routing = installVimKeyRouting();
  note.cm.findPosV = (position, amount) => ({
    line: position.line + amount,
    ch: position.ch,
  });
  note.cm.charCoords = (position) => ({
    left: position.ch,
    right: position.ch + 1,
    top: position.line,
    bottom: position.line + 1,
  });
  try {
    note.cm.setCursor(0, 3);
    Vim.handleKey(note.cm, "j", "user");
    assert.deepEqual(note.cm.getCursor(), { line: 1, ch: 0 });
    Vim.handleKey(note.cm, "j", "user");
    assert.deepEqual(note.cm.getCursor(), { line: 2, ch: 3 });
  } finally {
    routing.destroy();
  }
});
