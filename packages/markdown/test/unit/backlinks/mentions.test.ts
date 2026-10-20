import test from "node:test";
import assert from "node:assert/strict";
import { linkedLines, unlinkedLines } from "../../../src/markdown/mentions";

test("linked lines give one trimmed context line per link to the target", () => {
  const text = [
    "---",
    'up: "[[Target]]"',
    "---",
    "  First [[Target]] and [[Other]].",
    "Second ![[Target#Part|alias]] and [t](Target.md)",
  ].join("\n");
  const lines = linkedLines(text, (linkpath) =>
    /^target(\.md)?$/i.test(linkpath),
  );
  assert.deepEqual(
    lines.map(({ line, text }) => [line, text]),
    [
      [1, 'up: "[[Target]]"'],
      [3, "First [[Target]] and [[Other]]."],
      [4, "Second ![[Target#Part|alias]] and [t](Target.md)"],
      [4, "Second ![[Target#Part|alias]] and [t](Target.md)"],
    ],
  );
  assert.equal(
    text.slice(lines[0]!.offset, lines[0]!.offset + 10),
    "[[Target]]",
  );
});

test("unlinked mentions match whole words, any case, outside links and properties", () => {
  const text = [
    "---",
    "title: Project Atlas",
    "---",
    "Atlas is mentioned. atlases is not.",
    "Linked [[Atlas]] is skipped, [atlas](Atlas.md) too.",
    "The alias Big Map counts; so does ATLAS.",
  ].join("\n");
  const lines = unlinkedLines(text, ["Atlas", "Big Map"]);
  assert.deepEqual(
    lines.map(({ line, col }) => [line, col]),
    [
      [3, 0],
      [5, 10],
      [5, 34],
    ],
  );
  assert.deepEqual(unlinkedLines(text, ["", " "]), []);
});

test("long context lines are cut around the mention", () => {
  const text = `${"x ".repeat(200)}Target${" y".repeat(200)}`;
  const [line] = unlinkedLines(text, ["Target"]);
  assert.ok(line!.text.length <= 202);
  assert.ok(line!.text.includes("Target"));
  assert.ok(line!.text.startsWith("…") && line!.text.endsWith("…"));
});
