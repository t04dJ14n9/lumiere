import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { frontmatterBodyStart } from "./caret-guard";

const start = (source: string) =>
  frontmatterBodyStart(Text.of(source.split("\n")));

test("the body starts after the closing fence line", () => {
  assert.equal(start("---\ntitle: T\n---\nBody"), 17);
  assert.equal(start("---\na: 1\n...\nBody"), 13);
  assert.equal(start("---\n---\n\nBody"), 8);
});

test("a block with nothing after it ends at the end of the note", () => {
  assert.equal(start("---\na: 1\n---"), 12);
  assert.equal(start("---\na: 1\n---\n"), 13);
});

test("an unclosed or misplaced block is not properties", () => {
  assert.equal(start("---\na: 1\nBody"), undefined);
  assert.equal(start("\n---\na: 1\n---\n"), undefined);
  assert.equal(start("Body"), undefined);
  assert.equal(start("---"), undefined);
});
