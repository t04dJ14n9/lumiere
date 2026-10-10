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

test("a pending r, f, count or register keeps the normal block, as VSCodeVim does", () => {
  for (const visualMode of [false, true]) {
    const vim = {
      visualMode,
      expectLiteralNext: true,
      inputState: { keyBuffer: ["3", "r"] },
    };
    assert.equal(
      vimCaretMode({ vim } as never),
      visualMode ? "visual" : "normal",
    );
  }
});

test("an operator waiting for its motion is pending; the search and ex prompts are prompts", () => {
  for (const operator of ["delete", "yank", "change", "indent"]) {
    assert.equal(
      vimCaretMode({ vim: { inputState: { operator } } }),
      "pending",
    );
  }
  assert.equal(
    vimCaretMode({ vim: { inputState: { operator: null } } }),
    "normal",
  );
  assert.equal(vimCaretMode({ vim: {} }, true), "prompt");
  assert.equal(vimCaretMode({ vim: { visualMode: true } }, true), "prompt");
  assert.equal(vimCaretMode({ vim: { insertMode: true } }, true), "insert");
  assert.equal(vimCaretMode(undefined, true), "typing");
  assert.equal(
    vimCaretMode({
      vim: { visualMode: true, inputState: { operator: "delete" } },
    }),
    "visual",
  );
});

test("insert-mode text containing r is still insert", () => {
  assert.equal(
    vimCaretMode({
      vim: { insertMode: true, expectLiteralNext: true } as never,
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
