import test from "node:test";
import assert from "node:assert/strict";
import { readFindCaret, restoreFindCaret } from "./find-caret";

function field(value: string, start: number, end = start) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    setSelectionRange(nextStart: number, nextEnd: number) {
      this.selectionStart = nextStart;
      this.selectionEnd = nextEnd;
    },
    select() {
      this.selectionStart = 0;
      this.selectionEnd = this.value.length;
    },
  };
}

test("readFindCaret records the caret after a typed character", () => {
  assert.deepEqual(readFindCaret(field("p", 1)), { start: 1, end: 1 });
  assert.deepEqual(readFindCaret(field("pr", 2)), { start: 2, end: 2 });
  assert.deepEqual(readFindCaret(field("price", 2, 5)), { start: 2, end: 5 });
});

test("restoreFindCaret undoes findNext select-all so the next key appends (BH-010)", () => {
  const input = field("p", 1);
  const caret = readFindCaret(input);
  // CodeMirror selectSearchInput: select() while the find field is focused.
  input.select();
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, 1);
  restoreFindCaret(input, input, caret);
  assert.equal(input.selectionStart, 1);
  assert.equal(input.selectionEnd, 1);
  // Typing "r" now inserts at the caret → "pr", not replace → "r".
  input.value = input.value.slice(0, input.selectionStart) + "r";
  input.selectionStart = input.selectionEnd = 2;
  assert.equal(input.value, "pr");
});

test("restoreFindCaret leaves the field alone when focus moved away", () => {
  const input = field("p", 1);
  const caret = readFindCaret(input);
  input.select();
  restoreFindCaret(input, null, caret);
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, 1);
});
