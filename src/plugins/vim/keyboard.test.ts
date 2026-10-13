import assert from "node:assert/strict";
import test from "node:test";
import { Vim, type CodeMirror } from "@replit/codemirror-vim";
import { shiftedVimLineKey } from "./keyboard";

const mode = () => Vim.maybeInitVimState_({ state: {} } as CodeMirror);
const event = (key: string, code = "Digit4") => ({
  key,
  code,
  shiftKey: true,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
});

for (const [code, keys, expected] of [
  ["Digit4", ["￥", "¥", "Process"], "$"],
  ["Digit6", ["……", "…", "Process"], "^"],
] as const) {
  for (const key of keys) {
    test(`${code} ${key} resolves to ${expected} in normal mode`, () => {
      assert.equal(shiftedVimLineKey(event(key, code), mode()), expected);
    });
  }
}

for (const [key, code] of [
  ["$", "Digit4"],
  ["^", "Digit6"],
  ["4", "Digit4"],
  ["6", "Digit6"],
  ["0", "Digit0"],
  ["￥", "Digit6"],
  ["……", "Digit4"],
  ["Process", "KeyA"],
  ["Dead", "Digit6"],
  ["Unidentified", "Digit4"],
] as const) {
  test(`${key} on ${code} stays with the dependency`, () => {
    assert.equal(shiftedVimLineKey(event(key, code), mode()), undefined);
  });
}

for (const field of [
  "insertMode",
  "visualMode",
  "expectLiteralNext",
] as const) {
  test(`${field} preserves literal input`, () => {
    const vim = mode();
    vim[field] = true;
    assert.equal(shiftedVimLineKey(event("￥"), vim), undefined);
    assert.equal(shiftedVimLineKey(event("……", "Digit6"), vim), undefined);
  });
}

for (const field of [
  "ctrlKey",
  "altKey",
  "metaKey",
  "defaultPrevented",
] as const) {
  test(`${field} prevents translation`, () => {
    assert.equal(
      shiftedVimLineKey({ ...event("￥"), [field]: true }, mode()),
      undefined,
    );
  });
}

test("unshifted keys and disabled Vim are untouched", () => {
  assert.equal(
    shiftedVimLineKey({ ...event("￥"), shiftKey: false }, mode()),
    undefined,
  );
  assert.equal(shiftedVimLineKey(event("￥"), undefined), undefined);
});

test("pending counts and operators still receive native motions", () => {
  const vim = mode();
  vim.inputState.prefixRepeat.push("2");
  vim.inputState.operator = "delete";
  assert.equal(shiftedVimLineKey(event("￥"), vim), "$");
  assert.equal(shiftedVimLineKey(event("……", "Digit6"), vim), "^");
});
