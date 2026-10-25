import assert from "node:assert/strict";
import test from "node:test";
import { lineStartOffset, parseLineInput } from "./go-to-line";

test("parseLineInput clamps digits to the document and rejects junk", () => {
  assert.equal(parseLineInput("7", 12), 7);
  assert.equal(parseLineInput(" 7 ", 12), 7);
  assert.equal(parseLineInput("0", 12), 1);
  assert.equal(parseLineInput("99", 12), 12);
  for (const text of ["", " ", "1.5", "a", "-1", "1e2"]) {
    assert.equal(parseLineInput(text, 12), undefined, text);
  }
  assert.equal(parseLineInput("1", 0), undefined);
});

test("lineStartOffset points at the start of a 1-based line", () => {
  const source = "one\ntwo\nthree";
  assert.equal(lineStartOffset(source, 1), 0);
  assert.equal(lineStartOffset(source, 2), 4);
  assert.equal(lineStartOffset(source, 3), 8);
  assert.equal(lineStartOffset(source, 99), 8);
  assert.equal(lineStartOffset(source, 0), 0);
  assert.equal(lineStartOffset("", 1), 0);
});

test("lineStartOffset respects CRLF source offsets", () => {
  const source = "one\r\ntwo\r\nthree";
  assert.equal(lineStartOffset(source, 1), 0);
  assert.equal(lineStartOffset(source, 2), 5);
  assert.equal(lineStartOffset(source, 3), 10);
});
