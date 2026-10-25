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

test("IME Process digits with Shift map to US shifted glyphs; line keys still win first", () => {
  assert.equal(
    imeVimCommandKey(event("Process", "Digit4", { shiftKey: true }), mode()),
    "$",
  );
  assert.equal(
    translatedVimKey(event("Process", "Digit4", { shiftKey: true }), mode()),
    "$",
  );
  assert.equal(
    imeVimCommandKey(event("Process", "Digit8", { shiftKey: true }), mode()),
    "*",
  );
  assert.equal(
    translatedVimKey(event("Process", "Digit3", { shiftKey: true }), mode()),
    "#",
  );
});

test("all Shift+Digit0..Digit9 map to their US shifted symbols under IME Process", () => {
  const expected = [")", "!", "@", "#", "$", "%", "^", "&", "*", "("];
  for (let d = 0; d <= 9; d++) {
    assert.equal(
      translatedVimKey(
        event("Process", `Digit${d}`, { shiftKey: true }),
        mode(),
      ),
      expected[d],
    );
  }
});

test("IME Process Shift+Digit4 still yields $ in visual mode where line-key mapping skips", () => {
  const vim = mode();
  vim.visualMode = true;
  assert.equal(shiftedVimLineKey(event("Process", "Digit4"), vim), undefined);
  assert.equal(
    translatedVimKey(event("Process", "Digit4", { shiftKey: true }), vim),
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

for (const [key, code, expected] of [
  ["。", "Period", "."],
  ["，", "Comma", ","],
  ["；", "Semicolon", ";"],
] as const) {
  test(`Chinese ${key} on ${code} becomes ${expected} for Vim commands`, () => {
    assert.equal(
      translatedVimKey(event(key, code, { shiftKey: false }), mode()),
      expected,
    );
  });
}

for (const [code, shift, expected] of [
  ["Period", false, "."],
  ["Comma", false, ","],
  ["Semicolon", false, ";"],
  ["Slash", false, "/"],
  ["Slash", true, "?"],
  ["Minus", false, "-"],
  ["Equal", false, "="],
  ["BracketLeft", false, "["],
  ["BracketRight", true, "}"],
  ["Quote", false, "'"],
  ["Backquote", false, "`"],
  ["Backslash", true, "|"],
] as const) {
  for (const key of ["Process", "Unidentified"] as const) {
    test(`${key} on ${code} becomes ${expected} for Vim punctuation`, () => {
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

test("Chinese punctuation stays literal in insert mode and for f/t/r arguments", () => {
  for (const field of ["insertMode", "expectLiteralNext"] as const) {
    const vim = mode();
    vim[field] = true;
    assert.equal(
      translatedVimKey(event("。", "Period", { shiftKey: false }), vim),
      undefined,
    );
  }
});

test("ASCII punctuation and Chinese glyphs on the wrong code stay with the dependency", () => {
  assert.equal(
    translatedVimKey(event(".", "Period", { shiftKey: false }), mode()),
    undefined,
  );
  assert.equal(
    translatedVimKey(event("。", "Comma", { shiftKey: false }), mode()),
    undefined,
  );
});
