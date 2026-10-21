import assert from "node:assert/strict";
import test from "node:test";
import { Vim, type CodeMirror } from "@replit/codemirror-vim";
import {
  imeVimCommandKey,
  shiftedVimLineKey,
  translatedVimKey,
} from "./keyboard";

const mode = () => Vim.maybeInitVimState_({ state: {} } as CodeMirror);
const event = (
  key: string,
  code = "Digit4",
  extras: Partial<{
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    defaultPrevented: boolean;
  }> = {},
) => ({
  key,
  code,
  shiftKey: extras.shiftKey ?? true,
  ctrlKey: extras.ctrlKey ?? false,
  metaKey: extras.metaKey ?? false,
  altKey: extras.altKey ?? false,
  defaultPrevented: extras.defaultPrevented ?? false,
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
  test(`${key} on ${code} stays with the dependency for line keys`, () => {
    assert.equal(shiftedVimLineKey(event(key, code), mode()), undefined);
  });
}

for (const field of [
  "insertMode",
  "visualMode",
  "expectLiteralNext",
] as const) {
  test(`${field} preserves literal input for line keys`, () => {
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
  test(`${field} prevents line-key translation`, () => {
    assert.equal(
      shiftedVimLineKey({ ...event("￥"), [field]: true }, mode()),
      undefined,
    );
  });
}

test("unshifted keys and disabled Vim are untouched for line keys", () => {
  assert.equal(
    shiftedVimLineKey({ ...event("￥"), shiftKey: false }, mode()),
    undefined,
  );
  assert.equal(shiftedVimLineKey(event("￥"), undefined), undefined);
});

test("pending counts and operators still receive native line motions", () => {
  const vim = mode();
  vim.inputState.prefixRepeat.push("2");
  vim.inputState.operator = "delete";
  assert.equal(shiftedVimLineKey(event("￥"), vim), "$");
  assert.equal(shiftedVimLineKey(event("……", "Digit6"), vim), "^");
});

for (const [code, shift, expected] of [
  ["KeyG", false, "g"],
  ["KeyG", true, "G"],
  ["KeyJ", false, "j"],
  ["Digit3", false, "3"],
] as const) {
  for (const key of ["Process", "Unidentified"] as const) {
    test(`${key} on ${code} becomes ${expected} for Vim commands`, () => {
      assert.equal(
        imeVimCommandKey(event(key, code, { shiftKey: shift }), mode()),
        expected,
      );
      assert.equal(
        translatedVimKey(event(key, code, { shiftKey: shift }), mode()),
        expected,
      );
    });
  }
}

test("IME Process digits with Shift leave Chinese line keys to the dedicated mapper", () => {
  assert.equal(
    imeVimCommandKey(event("Process", "Digit4", { shiftKey: true }), mode()),
    undefined,
  );
  assert.equal(
    translatedVimKey(event("Process", "Digit4", { shiftKey: true }), mode()),
    "$",
  );
});

test("IME Process command keys work in visual mode and for literal arguments", () => {
  for (const field of ["visualMode", "expectLiteralNext"] as const) {
    const vim = mode();
    vim[field] = true;
    assert.equal(
      imeVimCommandKey(event("Process", "KeyG", { shiftKey: false }), vim),
      "g",
    );
  }
});

test("IME Process command keys stay literal in insert mode and with modifiers", () => {
  const vim = mode();
  vim.insertMode = true;
  assert.equal(
    imeVimCommandKey(event("Process", "KeyG", { shiftKey: false }), vim),
    undefined,
  );
  assert.equal(
    imeVimCommandKey(
      event("Process", "KeyG", { shiftKey: false, ctrlKey: true }),
      mode(),
    ),
    undefined,
  );
  assert.equal(
    imeVimCommandKey(event("g", "KeyG", { shiftKey: false }), mode()),
    undefined,
  );
});
