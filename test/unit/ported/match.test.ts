import test from "node:test";
import assert from "node:assert/strict";
import { matchScore, fuzzyMatch, queryTokens } from "../../../src/shared/fuzzy";
test("link suggestions use the Obsidian boundary, gap, spread and length penalties", () => {
  assert.ok(
    matchScore("att", "Attention", "notes/Attention.md")! >
      matchScore("ten", "Attention", "notes/Attention.md")!,
  );
  assert.ok(
    matchScore("att", "Attention", "notes/Attention.md")! >
      matchScore("atn", "Attention", "notes/Attention.md")!,
  );
  assert.equal(fuzzyMatch("a", "abc")?.score, -0.0103);
  assert.deepEqual(fuzzyMatch("ab", "a-b")?.matches, [
    [0, 1],
    [2, 3],
  ]);
});
test("every query word must match, in any field, case-insensitively", () => {
  assert.ok(
    matchScore("ML atten", "Attention", "ml/Attention.md") !== undefined,
  );
  assert.equal(
    matchScore("attention zebra", "Attention", "ml/Attention.md"),
    undefined,
  );
  assert.equal(matchScore("", "Anything", "Anything.md"), 0);
});
test("CJK characters are separate tokens and repeated query tokens cannot reuse one occurrence", () => {
  assert.deepEqual(queryTokens("机器 Learning"), ["机", "器", "learning"]);
  assert.ok(fuzzyMatch("机器", "器械与机械") !== undefined);
  assert.equal(fuzzyMatch("a a", "a"), undefined);
});
test("mixed CJK tokens and compatibility normalization preserve original UTF-16 highlight ranges", () => {
  assert.deepEqual(queryTokens("Learning机器"), ["learning", "机", "器"]);
  assert.deepEqual(fuzzyMatch("ffi", "ﬃ")?.matches, [[0, 1]]);
  assert.deepEqual(fuzzyMatch("å", "A\u030a")?.matches, [[0, 2]]);
});
test("whole tokens may reorder while subsequence fallback preserves query order", () => {
  assert.deepEqual(fuzzyMatch("beta alpha", "alpha beta")?.matches, [
    [0, 5],
    [6, 10],
  ]);
  assert.deepEqual(fuzzyMatch("ab cd", "a-b c-d")?.matches, [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
  ]);
  assert.equal(fuzzyMatch("ab cd", "c-d a-b"), undefined);
});
test("repeated tokens skip occupied matches and normalized ranges coalesce", () => {
  assert.deepEqual(fuzzyMatch("aa aa", "aaaa")?.matches, [[0, 4]]);
  assert.deepEqual(fuzzyMatch("f f i", "ﬃ")?.matches, [[0, 1]]);
  assert.deepEqual(fuzzyMatch("---", "anything"), { score: 0, matches: [] });
});

test("prepared ranking scores equal highlighted fuzzy scores for ASCII, CJK and normalization", async () => {
  const { prepareFuzzyText, preparedFuzzyScore } = await import(
    "../../../src/shared/fuzzy"
  );
  for (const query of [
    "",
    "a",
    "ab",
    "a a",
    "ab cd",
    "beta alpha",
    "机器",
    "ffi",
    "å",
    "σ",
    "---",
  ]) {
    for (const text of [
      "abc",
      "a-b c-d",
      "alpha beta",
      "aaaa",
      "器械与机械",
      "ﬃ",
      "A\u030a",
      "ΟΣ",
      "H2 · Note.md",
    ]) {
      assert.equal(
        preparedFuzzyScore(query, prepareFuzzyText(text)),
        fuzzyMatch(query, text)?.score,
        `${query}: ${text}`,
      );
    }
  }
});
