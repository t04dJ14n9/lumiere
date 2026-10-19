import test from "node:test";
import assert from "node:assert/strict";
import { Text } from "@codemirror/state";
import { difference } from "../../../src/shared/document/wire";

test("difference round-trips identical and empty rewrites", () => {
  assert.equal(
    difference("same", "same")
      .apply(Text.of(["same"]))
      .toString(),
    "same",
  );
  assert.equal(difference("", "a").apply(Text.empty).toString(), "a");
  assert.equal(
    difference("a", "")
      .apply(Text.of(["a"]))
      .toString(),
    "",
  );
});

test("an insert above a table and a later cell edit keep carets in the untouched cell", () => {
  const before =
    "para\n\n| a   |  b  |   c |\n| --- | :-: | --: |\n| 1A  |  2  |   3 |\n| 4   |  5  |   6 |\n\nafter\n";
  const after =
    "para\nnew first line\n\n| a   |  b  |   c |\n| --- | :-: | --: |\n| 1A  |  2  |   3 |\n| 4   |  five  |   6 |\n\nafter\n";
  const changes = difference(before, after);
  assert.equal(changes.apply(Text.of(before.split("\n"))).toString(), after);

  const hunks: { from: number; to: number; insert: string }[] = [];
  changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    hunks.push({ from, to, insert: inserted.toString() });
  });
  assert.deepEqual(hunks, [
    { from: 5, to: 5, insert: "new first line\n" },
    { from: 75, to: 76, insert: "five" },
  ]);

  const caret = before.indexOf("1A");
  const mapped = changes.mapPos(caret, 1);
  assert.equal(after.slice(mapped, mapped + 2), "1A");
  assert.notEqual(mapped, after.indexOf("five") + 4);
});

test("emoji at the start still replaces as one character span", () => {
  assert.equal(
    difference("🧠 note", "🧡 note")
      .apply(Text.of(["🧠 note"]))
      .toString(),
    "🧡 note",
  );
});
