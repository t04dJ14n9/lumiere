import test from "node:test";
import assert from "node:assert/strict";
import { countText, formatCounts } from "../../../src/plugins/wordCount/count";

// Each count below was read from Obsidian's status bar for the same text.
test("words are counted as Obsidian counts them", () => {
  const cases: [string, number][] = [
    ["", 0],
    ["one two  three", 3],
    ["---\ntitle: Many words here\n---\nBody only", 2],
    ["[[Link|Alias]] and [md](url)", 5],
    // Hyphens and apostrophes join a word, and a lone `-` is one.
    ["snake_case and kebab-case", 4],
    ["- item one\n- item two", 6],
    ["don’t stop rock'n'roll", 3],
    ["x — y – z", 3],
    // `,` and `.` join digits only; letters and digits run together.
    ["1,000.50 and 3.14 and 1.2.3", 5],
    ["e.g. U.S.A. end.", 6],
    ["abc123 def", 2],
    // Han and kana count one each, Korean runs whole words.
    ["中文，标点。", 4],
    ["コーヒー", 4],
    ["日本語のテキスト and 한국어", 10],
    ["〇一", 1],
    // Combining marks end a word, except in Tamil.
    ["हिन्दी भाषा", 5],
    ["தமிழ் மொழி", 2],
    ["🙂🙂", 0],
  ];
  for (const [text, words] of cases) {
    assert.equal(countText(text).words, words, JSON.stringify(text));
  }
});

test("characters are the text's length, line breaks included", () => {
  assert.equal(countText("line one\nline two\n").characters, 18);
  assert.equal(countText("ab\r\ncd").characters, 5);
  assert.equal(countText("---\na: b\n---\nxy").characters, 2);
  assert.equal(countText("emoji 😀 here").characters, 13);
});

test("a selection counts its properties too", () => {
  assert.deepEqual(countText("---\na: b\n---", false), {
    words: 4,
    characters: 12,
  });
});

test("counts read like Obsidian's status bar", () => {
  assert.equal(formatCounts({ words: 1, characters: 1 }), "1 word 1 character");
  assert.equal(
    formatCounts({ words: 1200, characters: 6543 }),
    "1,200 words 6,543 characters",
  );
});
