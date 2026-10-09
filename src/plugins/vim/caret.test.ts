import test from "node:test";
import assert from "node:assert/strict";
import { vimCaretMode } from "./caret";

test("no Vim state is normal typing; normal and all visual submodes get blocks", () => {
  assert.equal(vimCaretMode(), "typing");
  assert.equal(vimCaretMode({}), "typing");
  assert.equal(vimCaretMode({ vim: null }), "typing");
  assert.equal(vimCaretMode({ vim: {} }), "normal");
  for (const submode of [{}, { visualLine: true }, { visualBlock: true }]) {
    const state = { vim: { visualMode: true, ...submode } };
    assert.equal(vimCaretMode(state), "visual");
  }
});

test("R and insert-mode overwrite are replace; ordinary insert uses a line", () => {
  assert.equal(vimCaretMode({ vim: { insertMode: true } }), "insert");
  assert.equal(
    vimCaretMode({ vim: { insertMode: true }, overwrite: false }),
    "insert",
  );
  assert.equal(
    vimCaretMode({ vim: { insertMode: true }, overwrite: true }),
    "replace",
  );
  assert.equal(
    vimCaretMode({ vim: { insertMode: false }, overwrite: true }),
    "normal",
  );
});

test("pending r, counted r and visual r use an underline until completion or cancellation", () => {
  for (const keyBuffer of [["r"], ["3", "r"], ["1", "2", "r"]]) {
    for (const visualMode of [false, true]) {
      const vim = {
        visualMode,
        expectLiteralNext: true,
        inputState: { keyBuffer },
      };
      assert.equal(vimCaretMode({ vim }), "replace");
      vim.expectLiteralNext = false;
      vim.inputState.keyBuffer = [];
      assert.equal(vimCaretMode({ vim }), visualMode ? "visual" : "normal");
    }
  }
});

test("literal motion commands and insert-mode text containing r do not select replace", () => {
  for (const keyBuffer of [["f"], ["t"], ["g", "r"], ["d", "r"], []]) {
    assert.equal(
      vimCaretMode({
        vim: { expectLiteralNext: true, inputState: { keyBuffer } },
      }),
      "normal",
    );
  }
  assert.equal(
    vimCaretMode({
      vim: {
        insertMode: true,
        expectLiteralNext: true,
        inputState: { keyBuffer: ["r"] },
      },
    }),
    "insert",
  );
});

test("last replace action and stale mode labels never leave an underline after Escape", () => {
  const state = {
    overwrite: false,
    vim: {
      insertMode: false,
      visualMode: false,
      mode: "replace",
      lastEditActionCommand: {
        action: "enterInsertMode",
        actionArgs: { replace: true },
      },
    },
  };
  assert.equal(vimCaretMode(state), "normal");
  state.vim.mode = "normal";
  assert.equal(vimCaretMode(state), "normal");
});
