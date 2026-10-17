import test from "node:test";
import assert from "node:assert/strict";
import { isSeparator } from "../../../src/shared/diff/table-delimiter";

test("delimiter rows accept optional pipes, alignment and short GFM cells", () => {
  for (const line of [
    "---",
    "| --- |",
    ":-- | --:",
    "  |:---:|\t",
    "-|-",
    "|--|",
  ]) {
    assert.equal(isSeparator(line), true, line);
  }
});

test("delimiter rows reject empty cells, absent dashes and trailing text", () => {
  for (const line of [
    "",
    "|",
    "||",
    "|---||",
    ":",
    "::",
    "---x",
    "- -",
    "|---|text|",
  ]) {
    assert.equal(isSeparator(line), false, line);
  }
});
