import test from "node:test";
import assert from "node:assert/strict";
import { normalWordCommand } from "./word-navigation";
import type { VimMode } from "../vim/api";

const normal: VimMode = { insertMode: false, visualMode: false };

test("normal word routing recognizes counts and complete g prefixes", () => {
  for (const motion of ["w", "W", "e", "E", "b", "B", "ge", "gE"]) {
    const key = motion.at(-1)!;
    const prefix = motion.slice(0, -1);
    for (const count of ["", "2", "123"]) {
      assert.deepEqual(
        normalWordCommand(key, {
          ...normal,
          inputState: { keyBuffer: [...(count + prefix)] },
        }),
        { motion, count: Number(count || 1) },
      );
    }
  }
});

test("operators, insert, visual and unrelated prefixes keep their Vim handling", () => {
  for (const mode of [
    undefined,
    { insertMode: true },
    { visualMode: true },
    { inputState: { operator: "delete" } },
    { inputState: { operator: "change", keyBuffer: ["2"] } },
    { inputState: { keyBuffer: ["f"] } },
    { inputState: { keyBuffer: ["r"] } },
    { inputState: { keyBuffer: ["z"] } },
    { inputState: { keyBuffer: ["g", "g"] } },
  ]) {
    for (const key of ["w", "W", "e", "b"]) {
      assert.equal(normalWordCommand(key, mode), undefined);
    }
  }
  assert.equal(normalWordCommand("g", normal), undefined);
  assert.equal(normalWordCommand("j", normal), undefined);
});
