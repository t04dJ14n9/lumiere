import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { tagSuggestion } from "../../../src/plugins/tags/suggestions";

/**
 * When Obsidian 1.14.4 opens its tag list, measured in a disposable vault by
 * typing the last character of each case (and over every BMP code point by
 * asking its tag suggester directly). Hexadecimal code point ranges.
 */
const measuredCharacters = {
  /** Directly before `#`, only these let the list open. */
  opens: "9 B-C 20 A0 1680 2000-200A 2028-2029 202F 205F 3000 FEFF",
  /** Between `#` and the caret, these close it (as they end a tag). */
  closes:
    "9 B-C 20-2C 2E 3A-40 5B-5E 60 7B-7E A0 1680 2000-206F 2E00-2E7F 3000 FEFF",
};
const astralSamples = [0x1f642, 0x1f600, 0x20000, 0x1d400, 0x10000, 0x1f3fb];
type SweepCase = [doc: string, caret: number, query: string | undefined];

function inRanges(ranges: string, codePoint: number): boolean {
  return ranges.split(" ").some((range) => {
    const [from, to = from] = range.split("-").map((hex) => parseInt(hex, 16));
    return codePoint >= from! && codePoint <= to!;
  });
}

/** The query offered with the caret at `caret`, replacing it from the `#` on. */
function query(doc: string, caret = doc.length): string | undefined {
  const trigger = tagSuggestion({
    state: EditorState.create({ doc }),
    pos: caret,
  });
  if (trigger) {
    assert.equal(trigger.from, caret - trigger.query.length, doc);
  }
  return trigger?.query;
}

/** The query offered with the caret at `|`, or at the end. */
function queryAtBar(text: string): string | undefined {
  const caret = text.indexOf("|");
  return caret === -1 ? query(text) : query(text.replace("|", ""), caret);
}

test("the tag list opens where Obsidian opens it", () => {
  const opens: [text: string, query: string][] = [
    ["#", ""],
    ["x #", ""],
    ["x #a", "a"],
    ["  #a", "a"],
    ["\t#a", "a"],
    ["x　#a", "a"],
    ["> #a", "a"],
    ["- #a", "a"],
    ["- [ ] #a", "a"],
    ["# H #a", "a"],
    ["> [!note] #a", "a"],
    ["x #a/b", "a/b"],
    ["x #a/", "a/"],
    ["x #-", "-"],
    ["x #_", "_"],
    ["x #/", "/"],
    // Digits alone are no tag, but the list still opens.
    ["x #1984", "1984"],
    ["x #学习", "学习"],
    ["x #a。b", "a。b"],
    ["x #a🙂", "a🙂"],
    ["x #a|b", "a"],
    ["x #a| b", "a"],
    ["x #a|.", "a"],
    ["x #|b", ""],
    ["line\nx #a", "a"],
  ];
  const closed = [
    "word#",
    "x(#",
    "(#a",
    "x(#a",
    "# ",
    "# Heading",
    "##",
    "x ##",
    "x #a b",
    "x #a.b",
    "x #a–b",
    "x #a#",
    // A tag starts after markup or another tag, but the list does not open.
    "x #a#b",
    "#a#b",
    "**#a",
    "x *#a",
    "x _#a",
    "x ==#a",
    "x ~~#a",
    "x [#a",
    "x ![#a",
    "x [[#a",
    "x `c`#a",
    "x $m$#a",
    "x \\*#a",
    "x <b>#a",
    "x [l](u)#a",
    "x %%c%%#a",
    ">#a",
    "-#a",
    "1.#a",
    "x​#a",
    "x\u0085#a",
    "中#a",
    "，#a",
    // A `#` right after the caret.
    "x #a|#",
    "x #|#b",
  ];
  assert.deepEqual(
    opens.map(([text]) => [text, queryAtBar(text)]),
    opens,
  );
  assert.deepEqual(
    closed.filter((text) => queryAtBar(text) !== undefined),
    [],
  );
});

test("the tag list's characters match Obsidian over every BMP code point", () => {
  const codePoints = [];
  for (let codePoint = 0; codePoint <= 0xffff; codePoint++) {
    const lineBreak = codePoint === 0x0a || codePoint === 0x0d;
    const surrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    if (!lineBreak && !surrogate) {
      codePoints.push(codePoint);
    }
  }
  const differences = [];
  for (const codePoint of [...codePoints, ...astralSamples]) {
    const c = String.fromCodePoint(codePoint);
    const opens = inRanges(measuredCharacters.opens, codePoint);
    const closes = inRanges(measuredCharacters.closes, codePoint);
    const expected: SweepCase[] = [
      [`x${c}#`, 2 + c.length, opens ? "" : undefined],
      [`x #${c}`, 3 + c.length, closes ? undefined : c],
      [`x #a${c}`, 4 + c.length, closes ? undefined : `a${c}`],
      // Only a `#` after the caret keeps the list closed.
      [`x #a${c}`, 4, c === "#" ? undefined : "a"],
    ];
    for (const [doc, caret, expectedQuery] of expected) {
      const found = query(doc, caret);
      if (found !== expectedQuery) {
        differences.push({
          codePoint: codePoint.toString(16),
          doc,
          caret,
          found,
        });
      }
    }
  }
  assert.deepEqual(differences, []);
});
