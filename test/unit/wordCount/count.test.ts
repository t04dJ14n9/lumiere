import test from "node:test";
import assert from "node:assert/strict";
import { countText, formatCounts } from "../../../src/plugins/wordCount/count";

test("words skip properties and Markdown punctuation; CJK characters count one each", () => {
  const cases: [string, number][] = [
    ["", 0],
    ["one two  three", 3],
    ["# Heading\n- **bold** item -- `code`", 4],
    ["don't stop co-op 3.14", 4],
    ["---\ntitle: Many words here\n---\nBody only", 2],
    ["中文字符", 4],
    ["日本語のテキスト and 한국어", 12],
    ["[[Linked note|alias]] text", 4],
  ];
  for (const [text, words] of cases) {
    assert.equal(countText(text).words, words, JSON.stringify(text));
  }
});

test("characters exclude line breaks; a selection counts its properties too", () => {
  assert.equal(countText("ab\r\ncd\n").characters, 4);
  assert.equal(countText("---\na: b\n---\nxy").characters, 2);
  assert.equal(countText("---\na: b\n---", false).words, 2);
  assert.equal(countText("😀 é").characters, 3);
});

test("counts read like Obsidian's status bar", () => {
  assert.equal(formatCounts({ words: 1, characters: 1 }), "1 word 1 character");
  assert.equal(
    formatCounts({ words: 1200, characters: 6543 }),
    "1,200 words 6,543 characters",
  );
});
