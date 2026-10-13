import test from "node:test";
import assert from "node:assert/strict";
import {
  EditorSelection,
  EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CodeMirror, Vim } from "@replit/codemirror-vim";
import { installCellWordNavigation } from "./word-navigation";
import { tableWordTarget, type WordMotion } from "./word-motion";

function wordFixture(text = "one two three", head = 0) {
  let state = EditorState.create({
    doc: text,
    selection: { anchor: head },
    extensions: EditorState.allowMultipleSelections.of(true),
  });
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
  // The macro recorder is real; its optional status dialog needs a browser.
  Object.defineProperty(cm, "openDialog", { value: undefined });
  const mode = Vim.maybeInitVimState_(cm);
  const original = cm.setCursor;
  const descriptor = Object.getOwnPropertyDescriptor(mode, "inputState");
  const calls: { motion: WordMotion; count: number }[] = [];
  const installed = installCellWordNavigation(view, cm, (motion, count) => {
    calls.push({ motion, count });
    const target = tableWordTarget({
      cells: [[state.doc.toString()]],
      current: { row: 0, column: 0, head: state.selection.main.head },
      motion,
      count,
    });
    if (target) {
      view.dispatch({ selection: { anchor: target.head } });
    }
    return true;
  });
  return { view, cm, mode, calls, installed, original, descriptor };
}

function keys(cm: CodeMirror, sequence: string) {
  for (const key of sequence) {
    Vim.handleKey(cm, key, "user");
  }
}

test("same-cell word recording and playback delete the same character", () => {
  const f = wordFixture();
  const register = Vim.getRegisterController().getRegister("a");
  try {
    keys(f.cm, "qawxq");
    assert.equal(f.view.state.doc.toString(), "one wo three");
    assert.equal(register.keyBuffer.join(""), "wx");
    f.view.dispatch({
      changes: {
        from: 0,
        to: f.view.state.doc.length,
        insert: "one two three",
      },
      selection: { anchor: 0 },
    });
    keys(f.cm, "@a");
    assert.equal(f.view.state.doc.toString(), "one wo three");
    assert.deepEqual(f.calls, [
      { motion: "w", count: 1 },
      { motion: "w", count: 1 },
    ]);
  } finally {
    register.clear();
    f.installed.destroy();
  }
});

test("word keys mapped to another motion follow Vim's normal map", () => {
  Vim.map("w", "b", "normal");
  const f = wordFixture("one two three", 4);
  try {
    keys(f.cm, "w");
    assert.equal(f.view.state.selection.main.head, 0);
    assert.deepEqual(f.calls, [{ motion: "b", count: 1 }]);
  } finally {
    f.installed.destroy();
    Vim.unmap("w", "normal");
  }
});

test("another key mapped to a counted word motion uses table routing", () => {
  Vim.map("Q", "2w", "normal");
  const f = wordFixture();
  try {
    keys(f.cm, "Q");
    assert.equal(f.view.state.selection.main.head, 8);
    assert.deepEqual(f.calls, [{ motion: "w", count: 2 }]);
    assert.equal(f.mode.inputState.keyBuffer.length, 0);
  } finally {
    f.installed.destroy();
    Vim.unmap("Q", "normal");
  }
});

test("resolved counts and g prefixes preserve all eight word motions", () => {
  for (const motion of ["w", "W", "e", "E", "b", "B", "ge", "gE"] as const) {
    const f = wordFixture("one two three", 4);
    try {
      keys(f.cm, `2${motion}`);
      assert.deepEqual(f.calls, [{ motion, count: 2 }]);
      assert.equal(f.mode.inputState.keyBuffer.length, 0);
    } finally {
      f.installed.destroy();
    }
  }
});

test("operators, visual, insert and non-word commands retain the cell buffer", () => {
  for (const command of ["dw", "vw", "iwe", "fw", "rw", "l"]) {
    const f = wordFixture();
    try {
      keys(f.cm, command);
      assert.deepEqual(f.calls, []);
    } finally {
      f.installed.destroy();
    }
  }
});

test("composition and multiple selections do not route; disposal restores hooks", () => {
  const f = wordFixture();
  try {
    Object.assign(f.view, { composing: true });
    keys(f.cm, "w");
    assert.deepEqual(f.calls, []);
    Object.assign(f.view, { composing: false });
    f.view.dispatch({
      selection: EditorSelection.create([
        EditorSelection.cursor(0),
        EditorSelection.cursor(4),
      ]),
    });
    keys(f.cm, "w");
    assert.deepEqual(f.calls, []);
    f.view.dispatch({ selection: { anchor: 4 } });
  } finally {
    f.installed.destroy();
  }
  assert.equal(f.cm.setCursor, f.original);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.mode, "inputState"), {
    ...f.descriptor,
    value: f.mode.inputState,
  });
  keys(f.cm, "b");
  assert.deepEqual(f.calls, []);
});

test("word-to-nonword mappings keep their native command and clear stale context", () => {
  Vim.map("w", "l", "normal");
  const f = wordFixture();
  try {
    keys(f.cm, "w");
    assert.equal(f.view.state.selection.main.head, 1);
    assert.deepEqual(f.calls, []);
  } finally {
    Vim.unmap("w", "normal");
  }
  try {
    keys(f.cm, "wl");
    assert.equal(f.view.state.selection.main.head, 5);
    assert.deepEqual(f.calls, [{ motion: "w", count: 1 }]);
  } finally {
    f.installed.destroy();
  }
});

test("input reset observers remain chained and are restored on disposal", () => {
  const f = wordFixture();
  f.installed.destroy();
  let input = f.mode.inputState;
  let resets = 0;
  const get = () => input;
  const set = (next: typeof input) => {
    input = next;
    resets++;
  };
  Object.defineProperty(f.mode, "inputState", {
    configurable: true,
    enumerable: true,
    get,
    set,
  });
  const installed = installCellWordNavigation(f.view, f.cm, () => false);
  try {
    keys(f.cm, "2w");
    assert.ok(resets > 0);
    assert.equal(f.view.state.selection.main.head, 8);
  } finally {
    installed.destroy();
  }
  const restored = Object.getOwnPropertyDescriptor(f.mode, "inputState");
  assert.equal(restored?.get, get);
  assert.equal(restored?.set, set);
  assert.equal(f.mode.inputState, input);
});
